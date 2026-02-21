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
  import { getTeamLogoPathByAbbr, getTeamLogoScaleByAbbr } from '../utils/team.utils';
  import RedditCommentNode from './RedditCommentNode.svelte';
  import type { RedditComment, RedditPost } from '../types/nba';

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
  let collapsedByView: Record<string, Record<string, true>> = {};
  let scrollYByView: Record<string, number> = {};
  let activeViewKey = '';

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

  $: currentMode = mode === 'LIVE' || mode === 'POST' ? mode : null;
  $: currentSource = currentMode ? selectedSourceByMode[currentMode] : 'reddit';
  $: thread = currentMode ? cache[currentMode][currentSource].thread : null;
  $: comments = currentMode ? cache[currentMode][currentSource].comments : [];
  $: hasVisibleComments = (comments?.length ?? 0) > 0;
  $: awaySourceLabel = teamButtonLabel(awayName);
  $: homeSourceLabel = teamButtonLabel(homeName);
  $: awayLogoAbbr = resolveTeamLogoAbbr(awayName);
  $: homeLogoAbbr = resolveTeamLogoAbbr(homeName);

  $: {
    const nextViewKey = currentMode ? makeViewKey(currentMode, currentSource) : '';
    if (nextViewKey === activeViewKey) {
      // no-op
    } else {
      saveActiveViewScroll();
      activeViewKey = nextViewKey;
      if (activeViewKey) void restoreScrollForView(activeViewKey);
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

    try {
      const result = await nbaService.getRedditComments(post.id, sort, post.permalink, forceRefresh);
      if (requestId !== commentsRequestSeq || mode !== targetMode || selectedSourceByMode[targetMode] !== targetSource) return;
      const nextComments = sortedCopy(result.comments ?? [], sortChoice);
      applyCollapsedMap(nextComments, collapsedByView[makeViewKey(targetMode, targetSource)] ?? {});
      cache[targetMode][targetSource].comments = nextComments;
      syncCollapsedMapFor(targetMode, targetSource);
      cache = { ...cache };
    } catch (error: unknown) {
      if (requestId !== commentsRequestSeq || mode !== targetMode || selectedSourceByMode[targetMode] !== targetSource) return;
      console.error('Failed to fetch comments:', error);
      errorMsg = error instanceof Error ? error.message : 'Failed to fetch comments';
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
    const targetSource: ThreadSource = 'reddit';
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
      if (eventId) {
        const eventCached = nbaService.getCachedThreadForEvent(eventId, targetMode === 'POST' ? 'post' : 'live');
        if (eventCached) post = eventCached;
      }

      if (!post && !preferDirectSearch) {
        const mapping = await nbaService.getRedditIndex();
        const entry = mapping[createPairKey(awayName, homeName)];
        post = (targetMode === 'POST' ? entry?.pgt : entry?.gdt) ?? null;
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

        const result = await nbaService.searchRedditThread({
          type: targetMode === 'POST' ? 'post' : 'live',
          awayCandidates: [awayName],
          homeCandidates: [homeName],
          eventDate,
          eventId
        });
        post = result?.post ?? null;

        if (post) {
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
      triedFetch[targetMode][targetSource] = false;
      if (mode === targetMode) loading = false;
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
      cache = { ...cache };

      if (!post?.id) return;
      const sort: SortChoice = targetMode === 'POST' ? 'top' : 'new';
      const commentsResult = await nbaService.getRedditComments(post.id, sort, post.permalink);
      const nextComments = sortedCopy(commentsResult.comments ?? [], sort);
      applyCollapsedMap(nextComments, collapsedByView[makeViewKey(targetMode, targetSource)] ?? {});
      cache[targetMode][targetSource].comments = nextComments;
      syncCollapsedMapFor(targetMode, targetSource);
      cache = { ...cache };
    } catch (error) {
      console.warn(`Background prefetch failed for ${targetSource} source:`, error);
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
    if (!subreddit) {
      cache[targetMode][targetSource].thread = null;
      cache[targetMode][targetSource].comments = [];
      cache = { ...cache };
      loading = false;
      return;
    }

    const existing = cache[targetMode][targetSource].thread ?? readStoredThread(targetMode, targetSource);
    if (existing) {
      cache[targetMode][targetSource].thread = existing;
      cache = { ...cache };
      if (activeViewKey === makeViewKey(targetMode, targetSource)) void restoreScrollForView(activeViewKey);
      await fetchCommentsFor(existing, sort, targetMode, targetSource);
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
        loading = false;
      }
    } catch (error: unknown) {
      console.error(`Failed to load r/${subreddit} thread:`, error);
      errorMsg = error instanceof Error ? error.message : `Failed to load r/${subreddit} thread`;
      triedFetch[targetMode][targetSource] = false;
      loading = false;
    }
  }

  async function ensureActiveSourceLoaded(targetMode: FeedMode): Promise<void> {
    const source = selectedSourceByMode[targetMode];
    if (source === 'reddit') {
      await ensureRedditThreadAndComments(targetMode);
      return;
    }
    await ensureTeamThreadAndComments(targetMode, source);
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
    ensureActiveSourceLoaded(mode);
  } else {
    loading = false;
  }
  $: onSourceChange({ mode: 'LIVE', source: selectedSourceByMode.LIVE });
  $: onSourceChange({ mode: 'POST', source: selectedSourceByMode.POST });

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
    if (!currentMode) return;
    const post = cache[currentMode][currentSource].thread;
    if (!post) {
      triedFetch[currentMode][currentSource] = false;
      await ensureActiveSourceLoaded(currentMode);
      return;
    }
    const sort: SortChoice = currentMode === 'POST' ? 'top' : 'new';
    await fetchCommentsFor(post, sort, currentMode, currentSource, true);
  }

  function getPickerLogoStyle(abbr: string): string {
    const scale = getTeamLogoScaleByAbbr(abbr, 1.12);
    const sizeRem = 2 * scale; // Base picker logo size is 2rem (h-8/w-8)
    return `width:${sizeRem}rem;height:${sizeRem}rem;display:block;object-position:center center;flex-shrink:0;`;
  }

  onMount(() => {
    restorePersistedUIState();
  });

  onDestroy(() => {
    saveActiveViewScroll();
    persistUIState();
  });
</script>

<div class="min-w-0 overflow-x-hidden">
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
        <svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true" focusable="false">
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
  {:else if !thread}
    <div class="text-white/70">No comments yet.</div>
  {:else}
    <div class="space-y-3">
      {#each comments as c, i (c.id || i)}
        <div class="w-full text-left border border-white/10 rounded p-2">
          <RedditCommentNode comment={c} on:toggle={handleCommentToggle} />
        </div>
      {/each}
    </div>
  {/if}
</div>
