<script context="module" lang="ts">
  interface PersistedUIState {
    cache: unknown;
    selectedSourceByMode: unknown;
    collapsedByView: Record<string, Record<string, true>>;
    scrollYByView: Record<string, number>;
  }

  const uiStateByEventId = new Map<string, PersistedUIState>();
</script>

<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { nbaService } from '../services/nba.service';
  import { createPairKey } from '../utils/reddit.utils';
  import { expandTeamNames } from '../utils/team-matching.utils';
  import { getTeamLogoPathByAbbr, getTeamLogoScaleByAbbr } from '../utils/team.utils';
  import RedditCommentNode from './RedditCommentNode.svelte';
  import type { RedditComment, RedditPost, RedditSearchDiagnostics } from '../types/nba';

  type FeedMode = 'LIVE' | 'POST';
  type ViewMode = FeedMode | 'STATS';
  type ThreadSource = 'reddit' | 'away' | 'home';
  type SortChoice = 'new' | 'top';

  interface ModeCache {
    thread: RedditPost | null;
    comments: RedditComment[];
  }

  interface SourceCache {
    reddit: ModeCache;
    away: ModeCache;
    home: ModeCache;
  }

  interface CacheState {
    LIVE: SourceCache;
    POST: SourceCache;
  }

  export let awayName: string;
  export let homeName: string;
  export let mode: ViewMode;
  export let eventDate: string | undefined = undefined;
  export let eventId: string | undefined = undefined;
  export let initialSourceLive: ThreadSource = 'reddit';
  export let initialSourcePost: ThreadSource = 'reddit';
  export let onSourceChange: (state: { mode: FeedMode; source: ThreadSource }) => void = () => {};

  let sortChoice: SortChoice = 'new';
  let loading = false;
  let errorMsg = '';
  let triedFetch: Record<FeedMode, Record<ThreadSource, boolean>> = {
    LIVE: { reddit: false, away: false, home: false },
    POST: { reddit: false, away: false, home: false }
  };
  let lastFetchAttemptAt: Record<FeedMode, Record<ThreadSource, number>> = {
    LIVE: { reddit: 0, away: 0, home: 0 },
    POST: { reddit: 0, away: 0, home: 0 }
  };
  const THREAD_RETRY_COOLDOWN_MS = 8000;
  let selectedSourceByMode: Record<FeedMode, ThreadSource> = {
    LIVE: initialSourceLive,
    POST: initialSourcePost
  };
  let commentsRequestSeq = 0;
  let refreshing = false;
  let collapsedByView: Record<string, Record<string, true>> = {};
  let scrollYByView: Record<string, number> = {};
  let activeViewKey = '';
  let lastTeamsKey = '';
  let lastAutoFetchKey = '';
  let showDebug = false;
  let lastNoCommentsLogKey = '';
  let lastThreadMissingLogKey = '';
  let debugLogEntries: Array<{ at: string; level: 'info' | 'warn' | 'error'; message: string; details?: Record<string, any> }> = [];
  let flairImagesReady = false;
  let flairReadyTimeout: ReturnType<typeof setTimeout> | null = null;
  let flairReadyIdleId: number | null = null;
  let lastEnsureKey = '';
  let ensureQueued = false;
  let ensureInFlight: Record<FeedMode, Record<ThreadSource, boolean>> = {
    LIVE: { reddit: false, away: false, home: false },
    POST: { reddit: false, away: false, home: false }
  };

  function emptyModeCache(): ModeCache {
    return { thread: null, comments: [] };
  }

  function emptySourceCache(): SourceCache {
    return {
      reddit: emptyModeCache(),
      away: emptyModeCache(),
      home: emptyModeCache()
    };
  }

  let cache: CacheState = {
    LIVE: emptySourceCache(),
    POST: emptySourceCache()
  };

  function deepClone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }

  function makeViewKey(targetMode: FeedMode, targetSource: ThreadSource): string {
    return `${targetMode}:${targetSource}`;
  }

  function buildCollapsedMap(nodes: RedditComment[]): Record<string, true> {
    const out: Record<string, true> = {};
    const visit = (items: RedditComment[]) => {
      for (const item of items ?? []) {
        const id = String(item?.id ?? '');
        if (id && item?._collapsed) out[id] = true;
        if (item?.replies?.length) visit(item.replies);
      }
    };
    visit(nodes ?? []);
    return out;
  }

  function applyCollapsedMap(nodes: RedditComment[], collapsed: Record<string, true>): void {
    const visit = (items: RedditComment[]) => {
      for (const item of items ?? []) {
        const id = String(item?.id ?? '');
        if (id && collapsed[id]) item._collapsed = true;
        if (item?.replies?.length) visit(item.replies);
      }
    };
    visit(nodes ?? []);
  }

  function syncCollapsedMapFor(targetMode: FeedMode, targetSource: ThreadSource): void {
    const key = makeViewKey(targetMode, targetSource);
    collapsedByView[key] = buildCollapsedMap(cache[targetMode][targetSource].comments ?? []);
  }

  function restorePersistedUIState(): void {
    if (!eventId) return;
    const persisted = uiStateByEventId.get(eventId);
    if (!persisted) return;
    cache = deepClone(persisted.cache) as CacheState;
    selectedSourceByMode = deepClone(persisted.selectedSourceByMode) as Record<FeedMode, ThreadSource>;
    collapsedByView = deepClone(persisted.collapsedByView);
    scrollYByView = deepClone(persisted.scrollYByView);
  }


  async function withTimeout<T>(promise: Promise<T>, label: string, ms = 8000): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  function persistUIState(): void {
    if (!eventId) return;
    try {
      syncCollapsedMapFor('LIVE', 'reddit');
      syncCollapsedMapFor('LIVE', 'away');
      syncCollapsedMapFor('LIVE', 'home');
      syncCollapsedMapFor('POST', 'reddit');
      syncCollapsedMapFor('POST', 'away');
      syncCollapsedMapFor('POST', 'home');
    } catch {}
    uiStateByEventId.set(eventId, deepClone({
      cache,
      selectedSourceByMode,
      collapsedByView,
      scrollYByView
    }));
  }

  function saveActiveViewScroll(): void {
    if (typeof window === 'undefined' || !activeViewKey) return;
    scrollYByView[activeViewKey] = window.scrollY || 0;
  }

  async function restoreScrollForView(viewKey: string): Promise<void> {
    if (typeof window === 'undefined' || !viewKey) return;
    const targetY = Number(scrollYByView[viewKey]);
    if (!Number.isFinite(targetY)) return;
    await tick();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.scrollTo({ top: targetY, left: 0, behavior: 'auto' });
      });
    });
  }

  function sourceThreadStorageKey(targetMode: FeedMode, targetSource: ThreadSource): string {
    return `arrnba:thread:${eventId || 'unknown'}:${targetMode}:${targetSource}`;
  }

  function clearStoredThread(targetMode: FeedMode, targetSource: ThreadSource): void {
    if (typeof window === 'undefined') return;
    if (!eventId) return;
    try {
      localStorage.removeItem(sourceThreadStorageKey(targetMode, targetSource));
    } catch {}
  }

  function readStoredThread(targetMode: FeedMode, targetSource: ThreadSource): RedditPost | null {
    if (typeof window === 'undefined') return null;
    if (!eventId) return null;
    try {
      const raw = localStorage.getItem(sourceThreadStorageKey(targetMode, targetSource));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as RedditPost;
      if (!parsed?.id) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function writeStoredThread(targetMode: FeedMode, targetSource: ThreadSource, post: RedditPost | null): void {
    if (typeof window === 'undefined') return;
    if (!eventId || !post?.id) return;
    try {
      localStorage.setItem(sourceThreadStorageKey(targetMode, targetSource), JSON.stringify(post));
    } catch {}
  }

  function isThreadWithinWindow(post: RedditPost | null, targetMode: FeedMode, dateStr?: string): boolean {
    if (!post || !dateStr) return false;
    const targetMs = new Date(dateStr).getTime();
    if (!Number.isFinite(targetMs)) return false;
    const target = Math.floor(targetMs / 1000);
    const targetDate = new Date(targetMs);
    const dateOnly = targetDate.getUTCHours() === 0 && targetDate.getUTCMinutes() === 0 && targetDate.getUTCSeconds() === 0;
    if (!post.created_utc) return true;
    const created = Number(post.created_utc);
    if (!Number.isFinite(created)) return false;
    if (targetMode === 'LIVE') {
      if (dateOnly) return created >= target - (12 * 3600) && created <= target + (12 * 3600);
      return created >= target - (12 * 3600) && created <= target + (12 * 3600);
    }
    if (dateOnly) return created >= target + (0 * 3600) && created <= target + (24 * 3600);
    return created >= target - (1 * 3600) && created <= target + (18 * 3600);
  }

  function formatCreatedUtc(post?: RedditPost | null): string {
    const created = Number(post?.created_utc ?? 0);
    if (!Number.isFinite(created) || created <= 0) return '';
    return new Date(created * 1000).toISOString();
  }

  function activeWindowSeconds(targetMode: FeedMode, dateStr?: string): [number, number] {
    const targetMs = dateStr ? new Date(dateStr).getTime() : NaN;
    const dateOnly =
      Number.isFinite(targetMs) &&
      (() => {
        const d = new Date(targetMs);
        return d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0;
      })();
    if (targetMode === 'LIVE') return dateOnly ? ([-12 * 3600, 12 * 3600] as [number, number]) : ([-12 * 3600, 12 * 3600] as [number, number]);
    return dateOnly ? ([0 * 3600, 24 * 3600] as [number, number]) : ([-1 * 3600, 18 * 3600] as [number, number]);
  }

  function buildSearchQueryForDebug(targetMode: FeedMode): string {
    const base = targetMode === 'POST' ? '"POST GAME THREAD"' : '"GAME THREAD"';
    const awayTerms = expandTeamNames([awayName]).map((t) => `"${t}"`).join(' OR ');
    const homeTerms = expandTeamNames([homeName]).map((t) => `"${t}"`).join(' OR ');
    const terms = [awayTerms, homeTerms].filter(Boolean).map((group) => `(${group})`).join(' ');
    const extra = targetMode === 'LIVE' ? ' -"POST GAME THREAD"' : '';
    return `${base} ${terms}${extra}`.trim();
  }

  function compactDiagnostics(diag?: RedditSearchDiagnostics): Record<string, any> | undefined {
    if (!diag) return undefined;
    return {
      windowSeconds: diag.windowSeconds,
      counts: diag.counts,
      selected: diag.selected ?? null,
      samples: {
        inWindow: (diag.samples?.inWindow ?? []).slice(0, 3),
        modeMatch: (diag.samples?.modeMatch ?? []).slice(0, 3),
        strictMatch: (diag.samples?.strictMatch ?? []).slice(0, 3)
      }
    };
  }

  function commonDebugContext(targetMode: FeedMode, targetSource: ThreadSource, origin: string): Record<string, any> {
    return {
      mode: targetMode,
      source: targetSource,
      origin,
      eventId,
      eventDate,
      away: awayName,
      home: homeName,
      pairKey: createPairKey(awayName, homeName),
      windowSeconds: activeWindowSeconds(targetMode, eventDate),
      query: buildSearchQueryForDebug(targetMode)
    };
  }

  function debugLog(message: string, details?: Record<string, any>): void {
    if (!showDebug) return;
    if (details) {
      console.log('[reddit][diag-trace]', message, details);
    } else {
      console.log('[reddit][diag-trace]', message);
    }
  }

  function debugInfo(message: string, details: Record<string, any>): void {
    pushInlineDebugLog('info', message, details, true);
  }

  function pushInlineDebugLog(
    level: 'info' | 'warn' | 'error',
    message: string,
    details?: Record<string, any>,
    mirrorToConsole: boolean = false
  ): void {
    const entry = {
      at: new Date().toLocaleTimeString(),
      level,
      message,
      details
    };
    debugLogEntries = [entry, ...debugLogEntries].slice(0, 16);
    if (showDebug || mirrorToConsole) {
      const fn = level === 'error' ? console.error : (level === 'warn' ? console.warn : console.log);
      fn('[reddit][diag]', message, details ?? {});
    }
  }

  function logThreadNotPopulated(
    targetMode: FeedMode,
    targetSource: ThreadSource,
    origin: string,
    diagnostics?: RedditSearchDiagnostics
  ): void {
    const key = `${targetMode}:${targetSource}:${origin}:${eventId || 'no-event'}:${awayName}|${homeName}:${eventDate ?? ''}`;
    if (key === lastThreadMissingLogKey) return;
    lastThreadMissingLogKey = key;
    const details = { ...commonDebugContext(targetMode, targetSource, origin), diagnostics: compactDiagnostics(diagnostics) };
    pushInlineDebugLog('warn', 'thread unresolved', details);
  }

  function isTruthyDebugFlag(value: string | null): boolean {
    if (!value) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
  }

  function resolveShowDebugFromClient(): boolean {
    if (typeof window === 'undefined') return false;
    try {
      const params = new URLSearchParams(window.location.search);
      if (isTruthyDebugFlag(params.get('redditDebug')) || isTruthyDebugFlag(params.get('debug'))) return true;
      if (isTruthyDebugFlag(localStorage.getItem('redditDebug')) || isTruthyDebugFlag(localStorage.getItem('debug'))) return true;
    } catch {}
    return false;
  }

  $: currentMode = mode === 'LIVE' || mode === 'POST' ? mode : null;
  $: currentSource = currentMode ? selectedSourceByMode[currentMode] : 'reddit';
  $: thread = currentMode ? cache[currentMode][currentSource].thread : null;
  $: comments = currentMode ? cache[currentMode][currentSource].comments : [];
  $: hasVisibleComments = (comments?.length ?? 0) > 0;
  $: awaySourceLabel = teamButtonLabel(awayName);
  $: homeSourceLabel = teamButtonLabel(homeName);
  $: awayLogoAbbr = resolveTeamLogoAbbr(awayName);
  $: homeLogoAbbr = resolveTeamLogoAbbr(homeName);
  $: threadWithinWindow = currentMode ? isThreadWithinWindow(thread, currentMode, eventDate) : false;
  $: if (currentMode && !thread && !hasVisibleComments && !loading) {
    const key = `${currentMode}:${currentSource}:${eventId || 'no-event'}:${awayName}|${homeName}`;
    if (key !== lastNoCommentsLogKey) {
      lastNoCommentsLogKey = key;
      logThreadNotPopulated(currentMode, currentSource, 'ui');
      debugInfo('low activity (ui)', commonDebugContext(currentMode, currentSource, 'ui'));
    }
  }

  $: {
    const nextViewKey = currentMode ? makeViewKey(currentMode, currentSource) : '';
    if (nextViewKey === activeViewKey) {
      // no-op
    } else {
      saveActiveViewScroll();
      activeViewKey = nextViewKey;
      if (activeViewKey) void restoreScrollForView(activeViewKey);
      loading = false;
    }
  }

  $: if (currentMode && awayName && homeName) {
    const key = `${awayName}|${homeName}`;
    if (key !== lastTeamsKey) {
      lastTeamsKey = key;
      triedFetch[currentMode].reddit = false;
      triedFetch[currentMode].away = false;
      triedFetch[currentMode].home = false;
      ensureActiveSourceLoaded(currentMode);
    }
  }

  async function fetchCommentsFor(
    post: RedditPost,
    sort: SortChoice,
    targetMode: FeedMode,
    targetSource: ThreadSource,
    forceRefresh = false
  ): Promise<void> {
    if (!post?.id) return;

    const requestId = ++commentsRequestSeq;
    errorMsg = '';

    if (!cache[targetMode][targetSource].comments.length) {
      loading = true;
    }
    debugLog(`fetchCommentsFor ${targetMode}/${targetSource} id=${post.id} sort=${sort} force=${forceRefresh}`);

    try {
      let result = await nbaService.getRedditComments(post.id, sort, post.permalink, forceRefresh);
      if (!forceRefresh && (result.comments?.length ?? 0) === 0) {
        result = await nbaService.getRedditComments(post.id, sort, post.permalink, true);
      }
      if (requestId !== commentsRequestSeq || mode !== targetMode || selectedSourceByMode[targetMode] !== targetSource) return;
      debugLog(`commentsResult ${targetMode}/${targetSource} id=${post.id} count=${result.comments?.length ?? 0}`);
      if ((result.comments?.length ?? 0) === 0) {
        debugInfo('low activity comments', {
          ...commonDebugContext(targetMode, targetSource, 'comments'),
          postId: post.id,
          permalink: post.permalink,
          sort
        });
      }
      const nextComments = sortedCopy(result.comments ?? [], sortChoice);
      applyCollapsedMap(nextComments, collapsedByView[makeViewKey(targetMode, targetSource)] ?? {});
      cache[targetMode][targetSource].comments = nextComments;
      syncCollapsedMapFor(targetMode, targetSource);
      cache = { ...cache };
    } catch (error: unknown) {
      if (requestId !== commentsRequestSeq || mode !== targetMode || selectedSourceByMode[targetMode] !== targetSource) return;
      console.error('Failed to fetch comments:', error);
      errorMsg = error instanceof Error ? error.message : 'Failed to fetch comments';
      debugLog(`commentsError ${targetMode}/${targetSource} id=${post.id} ${errorMsg}`);
    } finally {
      if (requestId === commentsRequestSeq && mode === targetMode && selectedSourceByMode[targetMode] === targetSource) loading = false;
    }
  }

  function teamButtonLabel(name: string): string {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'TEAM';
    const tail = parts[parts.length - 1];
    if (/^\d/.test(tail)) return tail.toUpperCase();
    return tail.toUpperCase();
  }

  function includesAliasTerm(teamName: string, alias: string): boolean {
    const normalizedTeam = ` ${(teamName || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
    const normalizedAlias = ` ${(alias || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
    if (!normalizedTeam.trim() || !normalizedAlias.trim()) return false;
    return normalizedTeam.includes(normalizedAlias);
  }

  function resolveTeamSubreddit(teamName: string): string | null {
    const aliases: Array<[string, string]> = [
      ['hawks', 'AtlantaHawks'],
      ['celtics', 'bostonceltics'],
      ['nets', 'GoNets'],
      ['bknets', 'GoNets'],
      ['brooklyn', 'GoNets'],
      ['hornets', 'CharlotteHornets'],
      ['bulls', 'chicagobulls'],
      ['cavaliers', 'clevelandcavs'],
      ['mavericks', 'Mavericks'],
      ['nuggets', 'denvernuggets'],
      ['pistons', 'DetroitPistons'],
      ['warriors', 'warriors'],
      ['rockets', 'rockets'],
      ['pacers', 'pacers'],
      ['clippers', 'LAClippers'],
      ['lakers', 'lakers'],
      ['grizzlies', 'memphisgrizzlies'],
      ['heat', 'heat'],
      ['bucks', 'MkeBucks'],
      ['timberwolves', 'timberwolves'],
      ['pelicans', 'NOLAPelicans'],
      ['knicks', 'NYKnicks'],
      ['thunder', 'Thunder'],
      ['magic', 'OrlandoMagic'],
      ['76ers', 'sixers'],
      ['suns', 'suns'],
      ['trail blazers', 'ripcity'],
      ['blazers', 'ripcity'],
      ['kings', 'kings'],
      ['spurs', 'NBASpurs'],
      ['raptors', 'torontoraptors'],
      ['jazz', 'utahjazz'],
      ['wizards', 'washingtonwizards']
    ];

    for (const [match, subreddit] of aliases) {
      if (includesAliasTerm(teamName, match)) return subreddit;
    }
    return null;
  }

  function resolveTeamLogoAbbr(teamName: string): string {
    const aliases: Array<[string, string]> = [
      ['hawks', 'ATL'],
      ['celtics', 'BOS'],
      ['nets', 'BKN'],
      ['hornets', 'CHA'],
      ['bulls', 'CHI'],
      ['cavaliers', 'CLE'],
      ['mavericks', 'DAL'],
      ['nuggets', 'DEN'],
      ['pistons', 'DET'],
      ['warriors', 'GSW'],
      ['rockets', 'HOU'],
      ['pacers', 'IND'],
      ['clippers', 'LAC'],
      ['lakers', 'LAL'],
      ['grizzlies', 'MEM'],
      ['heat', 'MIA'],
      ['bucks', 'MIL'],
      ['timberwolves', 'MIN'],
      ['pelicans', 'NOP'],
      ['knicks', 'NYK'],
      ['thunder', 'OKC'],
      ['magic', 'ORL'],
      ['76ers', 'PHI'],
      ['suns', 'PHX'],
      ['trail blazers', 'POR'],
      ['blazers', 'POR'],
      ['kings', 'SAC'],
      ['spurs', 'SAS'],
      ['raptors', 'TOR'],
      ['jazz', 'UTA'],
      ['wizards', 'WAS']
    ];

    for (const [match, abbr] of aliases) {
      if (includesAliasTerm(teamName, match)) return abbr;
    }
    return '';
  }

  function sourceToSubreddit(source: ThreadSource): string | null {
    if (source === 'away') return resolveTeamSubreddit(awayName);
    if (source === 'home') return resolveTeamSubreddit(homeName);
    return null;
  }

  async function ensureRedditThreadAndComments(targetMode: FeedMode): Promise<void> {
    if (!awayName || !homeName) return;
    const targetSource: ThreadSource = 'reddit';
    if (ensureInFlight[targetMode][targetSource]) return;
    ensureInFlight[targetMode][targetSource] = true;
    debugLog(`ensureReddit start ${targetMode}`);
    const watchdog = setTimeout(() => {
      if (ensureInFlight[targetMode][targetSource]) {
        ensureInFlight[targetMode][targetSource] = false;
        debugLog(`ensureReddit timeout ${targetMode}`);
      }
    }, 10000);
    const sort: SortChoice = targetMode === 'POST' ? 'top' : 'new';
    const eventAgeDays = (() => {
      if (!eventDate) return 0;
      const ts = new Date(eventDate).getTime();
      if (!Number.isFinite(ts)) return 0;
      return Math.abs((Date.now() - ts) / (24 * 60 * 60 * 1000));
    })();
    const preferDirectSearch = eventAgeDays > 3;

    try {
      let post: RedditPost | null = readStoredThread(targetMode, targetSource);
      if (eventDate && !isThreadWithinWindow(post, targetMode, eventDate)) {
        pushInlineDebugLog('warn', 'dropping cached thread outside window', {
          ...commonDebugContext(targetMode, targetSource, 'storedCache'),
          postId: post?.id,
          postCreatedUtc: post?.created_utc
        });
        post = null;
        clearStoredThread(targetMode, targetSource);
      }
      if (eventId) {
        const eventCached = nbaService.getCachedThreadForEvent(eventId, targetMode === 'POST' ? 'post' : 'live');
        if (eventCached && (!eventDate || isThreadWithinWindow(eventCached, targetMode, eventDate))) {
          post = eventCached;
          debugInfo('thread found', {
            ...commonDebugContext(targetMode, targetSource, 'eventCache'),
            postId: post?.id,
            permalink: post?.permalink,
            postCreatedUtc: post?.created_utc
          });
        }
      }

      if (!post && !preferDirectSearch) {
        try {
          const mapping = await withTimeout(nbaService.getRedditIndex(), 'redditIndex');
          const entry = mapping[createPairKey(awayName, homeName)];
          post = (targetMode === 'POST' ? entry?.pgt : entry?.gdt) ?? null;
          if (eventDate && !isThreadWithinWindow(post, targetMode, eventDate)) {
            pushInlineDebugLog('warn', 'index hit rejected by window', {
              ...commonDebugContext(targetMode, targetSource, 'index'),
              postId: post?.id,
              postCreatedUtc: post?.created_utc
            });
            post = null;
          } else if (post) {
            debugInfo('thread found', {
              ...commonDebugContext(targetMode, targetSource, 'index'),
              postId: post?.id,
              permalink: post?.permalink,
              postCreatedUtc: post?.created_utc
            });
          }
        } catch (error) {
          debugLog(`redditIndex failed ${(error as Error)?.message ?? 'unknown'}`);
        }
      }

      if (post) {
        cache[targetMode][targetSource].thread = post;
        writeStoredThread(targetMode, targetSource, post);
        cache = { ...cache };
        await fetchCommentsFor(post, sort, targetMode, targetSource);
        void prefetchTeamSources(targetMode);
        return;
      }

      if (
        triedFetch[targetMode][targetSource] &&
        !cache[targetMode][targetSource].thread &&
        (Date.now() - (lastFetchAttemptAt[targetMode][targetSource] ?? 0)) >= THREAD_RETRY_COOLDOWN_MS
      ) {
        triedFetch[targetMode][targetSource] = false;
      }

      if (!triedFetch[targetMode][targetSource]) {
        triedFetch[targetMode][targetSource] = true;
        lastFetchAttemptAt[targetMode][targetSource] = Date.now();
        if (!cache[targetMode][targetSource].thread) loading = true;

        const result = await withTimeout(
          nbaService.searchRedditThread({
            type: targetMode === 'POST' ? 'post' : 'live',
            awayCandidates: [awayName],
            homeCandidates: [homeName],
            eventDate,
            eventId
          }),
          'redditSearch'
        );
        post = result?.post ?? null;
        if (!post) {
          logThreadNotPopulated(targetMode, targetSource, 'search', result?.diagnostics);
          debugInfo('no thread found', {
            ...commonDebugContext(targetMode, targetSource, 'search'),
            diagnostics: compactDiagnostics(result?.diagnostics)
          });
        }

        if (post) {
          debugInfo('thread found', {
            ...commonDebugContext(targetMode, targetSource, 'search'),
            postId: post?.id,
            permalink: post?.permalink,
            postCreatedUtc: post?.created_utc,
            diagnostics: compactDiagnostics(result?.diagnostics)
          });
          cache[targetMode][targetSource].thread = post;
          writeStoredThread(targetMode, targetSource, post);
          cache = { ...cache };
          await fetchCommentsFor(post, sort, targetMode, targetSource);
          void prefetchTeamSources(targetMode);
        } else if (mode === targetMode) {
          cache[targetMode][targetSource].thread = null;
          cache[targetMode][targetSource].comments = [];
          cache = { ...cache };
          loading = false;
        }
      } else if (mode === targetMode && !cache[targetMode][targetSource].thread) {
        cache[targetMode][targetSource].comments = [];
        cache = { ...cache };
        loading = false;
      }
      void prefetchTeamSources(targetMode);
    } catch (error) {
      console.error(`Error ensuring ${targetMode} r/nba thread:`, error);
      pushInlineDebugLog('error', `ensureReddit error (${targetMode})`, {
        ...commonDebugContext(targetMode, targetSource, 'ensureReddit'),
        error: (error as Error)?.message ?? 'unknown'
      });
      triedFetch[targetMode][targetSource] = false;
      if (mode === targetMode) loading = false;
      debugLog(`ensureReddit error ${targetMode} ${(error as Error)?.message ?? 'unknown'}`);
    } finally {
      clearTimeout(watchdog);
      ensureInFlight[targetMode][targetSource] = false;
      debugLog(`ensureReddit done ${targetMode}`);
    }
  }

  async function prefetchSingleTeamSource(targetMode: FeedMode, targetSource: 'away' | 'home'): Promise<void> {
    if (triedFetch[targetMode][targetSource]) return;
    const subreddit = sourceToSubreddit(targetSource);
    if (!subreddit) {
      triedFetch[targetMode][targetSource] = true;
      return;
    }

    triedFetch[targetMode][targetSource] = true;
    lastFetchAttemptAt[targetMode][targetSource] = Date.now();

    try {
      const result = await withTimeout(
        nbaService.searchSubredditThread(subreddit, {
          type: targetMode === 'POST' ? 'post' : 'live',
          awayCandidates: [awayName],
          homeCandidates: [homeName],
          eventDate,
          eventId
        }),
        `subredditSearch:${subreddit}`
      );

      const post = result?.post ?? null;
      cache[targetMode][targetSource].thread = post;
      writeStoredThread(targetMode, targetSource, post);
      cache = { ...cache };

      if (!post?.id) {
        pushInlineDebugLog('warn', 'prefetch team source found no thread', {
          ...commonDebugContext(targetMode, targetSource, `subreddit:${subreddit}`),
          diagnostics: compactDiagnostics(result?.diagnostics)
        });
        return;
      }
      const sort: SortChoice = targetMode === 'POST' ? 'top' : 'new';
      const commentsResult = await nbaService.getRedditComments(post.id, sort, post.permalink);
      const nextComments = sortedCopy(commentsResult.comments ?? [], sort);
      applyCollapsedMap(nextComments, collapsedByView[makeViewKey(targetMode, targetSource)] ?? {});
      cache[targetMode][targetSource].comments = nextComments;
      syncCollapsedMapFor(targetMode, targetSource);
      cache = { ...cache };
    } catch (error) {
      console.warn(`Background prefetch failed for ${targetSource} source:`, error);
      pushInlineDebugLog('warn', 'prefetch team source failed', {
        ...commonDebugContext(targetMode, targetSource, 'prefetchTeam'),
        subreddit,
        error: (error as Error)?.message ?? 'unknown'
      });
    }
  }

  async function prefetchTeamSources(targetMode: FeedMode): Promise<void> {
    await Promise.allSettled([
      prefetchSingleTeamSource(targetMode, 'away'),
      prefetchSingleTeamSource(targetMode, 'home')
    ]);
  }

  async function ensureTeamThreadAndComments(targetMode: FeedMode, targetSource: 'away' | 'home'): Promise<void> {
    const sort: SortChoice = targetMode === 'POST' ? 'top' : 'new';
    const subreddit = sourceToSubreddit(targetSource);
    if (ensureInFlight[targetMode][targetSource]) return;
    ensureInFlight[targetMode][targetSource] = true;
    debugLog(`ensureTeam start ${targetMode}/${targetSource}`);
    const watchdog = setTimeout(() => {
      if (ensureInFlight[targetMode][targetSource]) {
        ensureInFlight[targetMode][targetSource] = false;
        debugLog(`ensureTeam timeout ${targetMode}/${targetSource}`);
      }
    }, 10000);
    if (!subreddit) {
      cache[targetMode][targetSource].thread = null;
      cache[targetMode][targetSource].comments = [];
      cache = { ...cache };
      loading = false;
      ensureInFlight[targetMode][targetSource] = false;
      clearTimeout(watchdog);
      debugLog(`ensureTeam done ${targetMode}/${targetSource} (no subreddit)`);
      return;
    }

    let existing = cache[targetMode][targetSource].thread ?? readStoredThread(targetMode, targetSource);
    if (eventDate && !isThreadWithinWindow(existing, targetMode, eventDate)) {
      pushInlineDebugLog('warn', 'dropping team cached thread outside window', {
        ...commonDebugContext(targetMode, targetSource, 'teamStoredCache'),
        postId: existing?.id,
        postCreatedUtc: existing?.created_utc
      });
      existing = null;
      clearStoredThread(targetMode, targetSource);
    }
    if (existing) {
      cache[targetMode][targetSource].thread = existing;
      cache = { ...cache };
      if (activeViewKey === makeViewKey(targetMode, targetSource)) void restoreScrollForView(activeViewKey);
      await fetchCommentsFor(existing, sort, targetMode, targetSource);
      ensureInFlight[targetMode][targetSource] = false;
      clearTimeout(watchdog);
      debugLog(`ensureTeam done ${targetMode}/${targetSource} (cached)`);
      return;
    }

    if (
      triedFetch[targetMode][targetSource] &&
      !cache[targetMode][targetSource].thread &&
      (Date.now() - (lastFetchAttemptAt[targetMode][targetSource] ?? 0)) >= THREAD_RETRY_COOLDOWN_MS
    ) {
      triedFetch[targetMode][targetSource] = false;
    }

    if (triedFetch[targetMode][targetSource]) {
      loading = false;
      ensureInFlight[targetMode][targetSource] = false;
      clearTimeout(watchdog);
      debugLog(`ensureTeam done ${targetMode}/${targetSource} (tried)`);
      return;
    }

    triedFetch[targetMode][targetSource] = true;
    lastFetchAttemptAt[targetMode][targetSource] = Date.now();
    loading = true;
    errorMsg = '';

    try {
      const result = await nbaService.searchSubredditThread(subreddit, {
        type: targetMode === 'POST' ? 'post' : 'live',
        awayCandidates: [awayName],
        homeCandidates: [homeName],
        eventDate,
        eventId
      });

      const post = result?.post ?? null;
      cache[targetMode][targetSource].thread = post;
      writeStoredThread(targetMode, targetSource, post);
      cache[targetMode][targetSource].comments = [];
      cache = { ...cache };

      if (post) {
        await fetchCommentsFor(post, sort, targetMode, targetSource);
      } else {
        logThreadNotPopulated(targetMode, targetSource, `subreddit:${subreddit}`, result?.diagnostics);
        debugInfo('no team thread found', {
          ...commonDebugContext(targetMode, targetSource, `subreddit:${subreddit}`),
          diagnostics: compactDiagnostics(result?.diagnostics)
        });
        loading = false;
      }
    } catch (error: unknown) {
      console.error(`Failed to load r/${subreddit} thread:`, error);
      pushInlineDebugLog('error', `team thread load failed (${targetMode}/${targetSource})`, {
        ...commonDebugContext(targetMode, targetSource, 'ensureTeam'),
        subreddit,
        error: (error as Error)?.message ?? 'unknown'
      });
      errorMsg = error instanceof Error ? error.message : `Failed to load r/${subreddit} thread`;
      triedFetch[targetMode][targetSource] = false;
      loading = false;
      debugLog(`ensureTeam error ${targetMode}/${targetSource} ${(error as Error)?.message ?? 'unknown'}`);
    } finally {
      clearTimeout(watchdog);
      ensureInFlight[targetMode][targetSource] = false;
      debugLog(`ensureTeam done ${targetMode}/${targetSource}`);
    }
  }

  async function ensureActiveSourceLoaded(targetMode: FeedMode): Promise<void> {
    const source = selectedSourceByMode[targetMode];
    debugLog(`ensureActive ${targetMode}/${source}`);
    if (source === 'reddit') {
      await ensureRedditThreadAndComments(targetMode);
      return;
    }
    await ensureTeamThreadAndComments(targetMode, source);
  }

  function scheduleEnsure(targetMode: FeedMode): void {
    const source = selectedSourceByMode[targetMode];
    if (ensureInFlight[targetMode][source]) return;
    const key = `${targetMode}:${source}:${awayName}|${homeName}:${eventDate ?? ''}`;
    if (key === lastEnsureKey) return;
    lastEnsureKey = key;
    if (ensureQueued) return;
    ensureQueued = true;
    debugLog(`scheduleEnsure ${key}`);
    setTimeout(() => {
      ensureQueued = false;
      debugLog(`scheduleEnsure run ${key}`);
      ensureActiveSourceLoaded(targetMode);
    }, 0);
  }

  async function handleSourceClick(source: ThreadSource): Promise<void> {
    if (!currentMode) return;
    saveActiveViewScroll();
    const activeSource = selectedSourceByMode[currentMode];
    const activeThread = cache[currentMode][activeSource].thread;

    if (activeSource === source) {
      const openUrl = activeThread?.url || (activeThread?.permalink ? `https://www.reddit.com${activeThread.permalink}` : (activeThread?.id ? `https://www.reddit.com/comments/${activeThread.id}` : ''));
      if (openUrl) window.open(openUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    selectedSourceByMode[currentMode] = source;
    errorMsg = '';
    await ensureActiveSourceLoaded(currentMode);
  }

  $: if (mode === 'LIVE' || mode === 'POST') {
    const defaultSort: SortChoice = mode === 'POST' ? 'top' : 'new';
    sortChoice = defaultSort;
    scheduleEnsure(mode);
  } else {
    loading = false;
  }
  $: onSourceChange({ mode: 'LIVE', source: selectedSourceByMode.LIVE });
  $: onSourceChange({ mode: 'POST', source: selectedSourceByMode.POST });

  $: if (currentMode && thread?.id && (comments?.length ?? 0) === 0) {
    const key = `${currentMode}:${currentSource}:${thread.id}`;
    if (key !== lastAutoFetchKey) {
      lastAutoFetchKey = key;
      const sort: SortChoice = currentMode === 'POST' ? 'top' : 'new';
      fetchCommentsFor(thread, sort, currentMode, currentSource, true);
    }
  }

  function toggleCommentById(id: string): void {
    if (!currentMode || !id) return;
    const comments = cache[currentMode][currentSource].comments ?? [];
    let changed = false;
    const visit = (nodes: RedditComment[]): boolean => {
      for (const node of nodes ?? []) {
        if (String(node?.id ?? '') === id) {
          node._collapsed = !node._collapsed;
          return true;
        }
        if (node?.replies?.length && visit(node.replies)) return true;
      }
      return false;
    };
    changed = visit(comments);
    if (!changed) return;
    syncCollapsedMapFor(currentMode, currentSource);
    cache = { ...cache };
  }

  function handleCommentToggle(event: CustomEvent<{ id: string }>): void {
    toggleCommentById(event.detail?.id ?? '');
  }

  function sortedCopy(base: RedditComment[], choice: SortChoice): RedditComment[] {
    const cmp = (a: RedditComment, b: RedditComment) => {
      if (choice === 'top') return (b?.score ?? 0) - (a?.score ?? 0);
      return (b?.created_utc ?? 0) - (a?.created_utc ?? 0);
    };
    function cloneAndSort(nodes: RedditComment[]): RedditComment[] {
      const copy = (nodes || []).map((node) => ({
        ...node,
        replies: cloneAndSort(node?.replies || [])
      }));
      copy.sort(cmp);
      return copy;
    }
    return cloneAndSort(base || []);
  }

  function reorder(): void {
    if (!currentMode) return;
    cache[currentMode][currentSource].comments = sortedCopy(cache[currentMode][currentSource].comments, sortChoice);
    syncCollapsedMapFor(currentMode, currentSource);
    cache = { ...cache };
  }
  
  async function refreshComments(): Promise<void> {
    if (refreshing) return;
    refreshing = true;
    if (!currentMode) return;
    try {
      const post = cache[currentMode][currentSource].thread;
      if (!post) {
        triedFetch[currentMode][currentSource] = false;
        await ensureActiveSourceLoaded(currentMode);
        return;
      }
      const sort: SortChoice = currentMode === 'POST' ? 'top' : 'new';
      await fetchCommentsFor(post, sort, currentMode, currentSource, true);
    } finally {
      refreshing = false;
    }
  }

  function getPickerLogoStyle(abbr: string): string {
    const scale = getTeamLogoScaleByAbbr(abbr, 1.12);
    const sizeRem = 2 * scale; // Base picker logo size is 2rem (h-8/w-8)
    return `width:${sizeRem}rem;height:${sizeRem}rem;display:block;object-position:center center;flex-shrink:0;`;
  }

  onMount(() => {
    restorePersistedUIState();
    if (typeof window === 'undefined') return;
    showDebug = resolveShowDebugFromClient();
    if (showDebug) {
      pushInlineDebugLog(
        'info',
        'reddit diagnostics enabled',
        {
          redditDebug: new URLSearchParams(window.location.search).get('redditDebug'),
          debug: new URLSearchParams(window.location.search).get('debug')
        },
        true
      );
    }
    if ('requestIdleCallback' in window) {
      const idle = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
      flairReadyIdleId = idle.requestIdleCallback?.(() => {
        flairImagesReady = true;
      }, { timeout: 1200 }) ?? null;
    } else {
      flairReadyTimeout = setTimeout(() => {
        flairImagesReady = true;
      }, 650);
    }
  });

  onDestroy(() => {
    saveActiveViewScroll();
    persistUIState();
    if (flairReadyTimeout) clearTimeout(flairReadyTimeout);
    if (flairReadyIdleId !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
      (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback?.(flairReadyIdleId);
      flairReadyIdleId = null;
    }
  });
</script>

<div class="min-w-0 overflow-x-hidden pr-1">
  <div class="flex items-center justify-between mb-3">
    <div class="flex items-center gap-2 text-xs font-semibold">
      <button class="px-3 py-1 rounded {sortChoice === 'new' ? 'bg-white/25 text-white' : 'bg-black text-white border border-white/20'}" on:click={() => { sortChoice = 'new'; reorder(); }}>NEW</button>
      <button class="px-3 py-1 rounded {sortChoice === 'top' ? 'bg-white/25 text-white' : 'bg-black text-white border border-white/20'}" on:click={() => { sortChoice = 'top'; reorder(); }}>TOP</button>
      <button
        type="button"
        aria-label="Refresh comments"
        title="Refresh comments"
        class="h-10 w-10 rounded-full text-white/80 hover:text-white flex items-center justify-center text-xl leading-none"
        on:click={refreshComments}
      >
        <svg viewBox="0 0 24 24" class="h-5 w-5 {refreshing ? 'animate-spin' : ''}" aria-hidden="true" focusable="false">
          <path
            d="M20 12a8 8 0 1 1-2.34-5.66M20 4v4h-4"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>
    <div class="flex items-center gap-2">
      <button
        type="button"
        aria-label="r/NBA thread"
        title="r/NBA thread"
        class="h-9 w-9 rounded-full border {currentSource === 'reddit' ? 'border-white/70 ring-1 ring-white/50' : 'border-white/25'} bg-black/40 overflow-hidden flex items-center justify-center"
        on:click={() => handleSourceClick('reddit')}
      >
        <img src="/logos/rnba.png" alt="r/NBA" class="h-7 w-7 rounded-full object-cover" loading="lazy" decoding="async" />
      </button>
      <button
        type="button"
        aria-label={`${awaySourceLabel} subreddit thread`}
        title={awaySourceLabel}
        class="h-9 w-9 rounded-full border {currentSource === 'away' ? 'border-white/70 ring-1 ring-white/50' : 'border-white/25'} bg-black/40 overflow-hidden flex items-center justify-center"
        on:click={() => handleSourceClick('away')}
      >
        {#if awayLogoAbbr}
          <img src={getTeamLogoPathByAbbr(awayLogoAbbr)} alt={awaySourceLabel} class="object-contain" style={getPickerLogoStyle(awayLogoAbbr)} loading="lazy" decoding="async" />
        {:else}
          <span class="text-[10px] text-white/80">{awaySourceLabel}</span>
        {/if}
      </button>
      <button
        type="button"
        aria-label={`${homeSourceLabel} subreddit thread`}
        title={homeSourceLabel}
        class="h-9 w-9 rounded-full border {currentSource === 'home' ? 'border-white/70 ring-1 ring-white/50' : 'border-white/25'} bg-black/40 overflow-hidden flex items-center justify-center"
        on:click={() => handleSourceClick('home')}
      >
        {#if homeLogoAbbr}
          <img src={getTeamLogoPathByAbbr(homeLogoAbbr)} alt={homeSourceLabel} class="object-contain" style={getPickerLogoStyle(homeLogoAbbr)} loading="lazy" decoding="async" />
        {:else}
          <span class="text-[10px] text-white/80">{homeSourceLabel}</span>
        {/if}
      </button>
    </div>
  </div>
  {#if errorMsg}
    <div class="bg-red-900/20 border border-red-500/40 rounded p-2 mb-3">
      <div class="text-xs text-red-300/90">{errorMsg}</div>
    </div>
  {/if}
  {#if loading && !hasVisibleComments}
    <div class="text-white/70 flex items-center gap-2">
      <div class="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></div>
      Loading comments...
    </div>
  {:else if !thread && !hasVisibleComments}
    <div class="space-y-2">
      <div class="text-white/70">Low thread activity right now.</div>
      <div class="rounded border border-yellow-500/30 bg-yellow-950/20 p-2 text-[11px] text-yellow-100/90">
        <div class="font-semibold text-yellow-200/95 mb-1">Reddit debug</div>
        <div class="text-yellow-50/80 mb-1">
          mode={currentMode ?? '-'} source={currentSource} eventId={eventId ?? '-'}
        </div>
        {#if debugLogEntries.length > 0}
          <div class="space-y-1">
            {#each debugLogEntries as entry, idx (`${entry.at}:${entry.message}:${idx}`)}
              <div class="border border-yellow-500/20 rounded px-2 py-1">
                <div class="text-yellow-100/95">[{entry.at}] [{entry.level}] {entry.message}</div>
                {#if entry.details}
                  <pre class="whitespace-pre-wrap break-words text-[10px] text-yellow-50/80">{JSON.stringify(entry.details, null, 2)}</pre>
                {/if}
              </div>
            {/each}
          </div>
        {:else}
          <div class="text-yellow-50/70">No diagnostics captured yet.</div>
        {/if}
      </div>
    </div>
  {:else}
    <div class="space-y-3">
      {#each comments as c, i (c.id || i)}
        <div class="w-full text-left border border-white/10 rounded p-2">
          <RedditCommentNode comment={c} showFlairImages={flairImagesReady} on:toggle={handleCommentToggle} />
        </div>
      {/each}
    </div>
  {/if}
</div>
