<script lang="ts">
  import { nbaService } from '../services/nba.service';
  import { createPairKey, formatTimeAgo } from '../utils/reddit.utils';
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
  let selectedSourceByMode: Record<FeedMode, ThreadSource> = {
    LIVE: initialSourceLive,
    POST: initialSourcePost
  };
  let commentsRequestSeq = 0;

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
  $: awaySourceLabel = teamButtonLabel(awayName);
  $: homeSourceLabel = teamButtonLabel(homeName);
  $: awayLogoAbbr = resolveTeamLogoAbbr(awayName);
  $: homeLogoAbbr = resolveTeamLogoAbbr(homeName);

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

      cache[targetMode][targetSource].comments = sortedCopy(result.comments ?? [], sortChoice);
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

  function resolveTeamSubreddit(teamName: string): string | null {
    const name = (teamName || '').toLowerCase();
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
      if (name.includes(match)) return subreddit;
    }
    return null;
  }

  function resolveTeamLogoAbbr(teamName: string): string {
    const name = (teamName || '').toLowerCase();
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
      if (name.includes(match)) return abbr;
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

      if (!triedFetch[targetMode][targetSource]) {
        triedFetch[targetMode][targetSource] = true;
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
      cache[targetMode][targetSource].comments = sortedCopy(commentsResult.comments ?? [], sort);
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
      await fetchCommentsFor(existing, sort, targetMode, targetSource);
      return;
    }

    if (triedFetch[targetMode][targetSource]) {
      loading = false;
      return;
    }

    triedFetch[targetMode][targetSource] = true;
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

  function toggleTop(i: number): void {
    if (!currentMode) return;
    const comment = cache[currentMode][currentSource].comments?.[i];
    if (!comment) return;
    comment._collapsed = !comment._collapsed;
    cache = { ...cache };
  }

  function toggleReply(i: number, j: number): void {
    if (!currentMode) return;
    const reply = cache[currentMode][currentSource].comments?.[i]?.replies?.[j];
    if (!reply) return;
    reply._collapsed = !reply._collapsed;
    cache = { ...cache };
  }

  function toggleSub(i: number, j: number, k: number): void {
    if (!currentMode) return;
    const subReply = cache[currentMode][currentSource].comments?.[i]?.replies?.[j]?.replies?.[k];
    if (!subReply) return;
    subReply._collapsed = !subReply._collapsed;
    cache = { ...cache };
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
    cache = { ...cache };
  }
  
  async function refreshComments(): Promise<void> {
    if (!currentMode) return;
    const post = cache[currentMode][currentSource].thread;
    if (!post) return;
    const sort: SortChoice = currentMode === 'POST' ? 'top' : 'new';
    await fetchCommentsFor(post, sort, currentMode, currentSource, true);
  }
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
          <img src={`/logos/${awayLogoAbbr}.svg`} alt={awaySourceLabel} class="h-8 w-8 object-contain" style="transform: scale(1.12);" loading="lazy" decoding="async" />
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
          <img src={`/logos/${homeLogoAbbr}.svg`} alt={homeSourceLabel} class="h-8 w-8 object-contain" style="transform: scale(1.12);" loading="lazy" decoding="async" />
        {:else}
          <span class="text-[10px] text-white/80">{homeSourceLabel}</span>
        {/if}
      </button>
    </div>
  </div>
  {#if loading}
    <div class="text-white/70 flex items-center gap-2">
      <div class="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full"></div>
      Loading comments...
    </div>
  {:else if errorMsg}
    <div class="bg-red-900/20 border border-red-500/50 rounded p-3 mb-3">
      <div class="text-red-400 font-semibold mb-1">Reddit Error</div>
      <div class="text-sm text-red-300/80">{errorMsg}</div>
      <button class="mt-2 text-xs underline text-red-400 hover:text-red-300" on:click={refreshComments}>Try again</button>
    </div>
  {:else if !thread}
    <div class="text-white/70">No comments yet.</div>
  {:else}
    <div class="space-y-3">
      {#each comments as c, i (c.id || i)}
        <div role="button" tabindex="0" class="w-full text-left border border-white/10 rounded p-2 cursor-pointer" on:click={() => toggleTop(i)} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') toggleTop(i); }}>
          <div class="text-sm text-white/70">
            {c.author} - {c.score} - {formatTimeAgo(c.created_utc)} {c._collapsed ? '- collapsed' : ''}
          </div>
          {#if !c._collapsed}
            <div class="mt-1 whitespace-pre-wrap break-words">{c.body}</div>
            {#if c.replies && c.replies.length}
              <div class="mt-2 pl-3 border-l border-white/10 space-y-2">
                {#each c.replies as r, j (r.id || j)}
                  <div role="button" tabindex="0" class="w-full text-left cursor-pointer" on:click={(e) => { e.stopPropagation(); toggleReply(i, j); }} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); toggleReply(i, j); } }}>
                    <div class="text-sm text-white/70">
                      {r.author} - {r.score} - {formatTimeAgo(r.created_utc)} {r._collapsed ? '- collapsed' : ''}
                    </div>
                    {#if !r._collapsed}
                      <div class="whitespace-pre-wrap break-words">{r.body}</div>
                      {#if r.replies && r.replies.length}
                        <div class="mt-2 pl-3 border-l border-white/10 space-y-2">
                          {#each r.replies as rr, k (rr.id || k)}
                            <div role="button" tabindex="0" class="w-full text-left cursor-pointer" on:click={(e) => { e.stopPropagation(); toggleSub(i, j, k); }} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); toggleSub(i, j, k); } }}>
                              <div class="text-sm text-white/70">
                                {rr.author} - {rr.score} - {formatTimeAgo(rr.created_utc)} {rr._collapsed ? '- collapsed' : ''}
                              </div>
                              {#if !rr._collapsed}
                                <div class="whitespace-pre-wrap break-words">{rr.body}</div>
                              {/if}
                            </div>
                          {/each}
                        </div>
                      {/if}
                    {/if}
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>
