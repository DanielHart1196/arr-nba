<script lang="ts">
  import { nbaService } from '../services/nba.service';
  import { createPairKey, formatTimeAgo } from '../utils/reddit.utils';
  import type { RedditComment, RedditPost } from '../types/nba';

  type FeedMode = 'LIVE' | 'POST';
  type ViewMode = FeedMode | 'STATS';
  type SortChoice = 'new' | 'top';

  interface ModeCache {
    thread: RedditPost | null;
    comments: RedditComment[];
  }

  interface CacheState {
    LIVE: ModeCache;
    POST: ModeCache;
  }

  export let awayName: string;
  export let homeName: string;
  export let mode: ViewMode;

  let sortChoice: SortChoice = 'new';
  let loading = false;
  let errorMsg = '';
  let triedFetch: Record<FeedMode, boolean> = { LIVE: false, POST: false };
  let commentsRequestSeq = 0;

  // Local per-mode cache for instant toggles between LIVE/POST.
  let cache: CacheState = {
    LIVE: { thread: null, comments: [] },
    POST: { thread: null, comments: [] }
  };

  $: currentMode = mode === 'LIVE' || mode === 'POST' ? mode : null;
  $: thread = currentMode ? cache[currentMode].thread : null;
  $: comments = currentMode ? cache[currentMode].comments : [];

  async function fetchCommentsFor(
    post: RedditPost,
    sort: SortChoice,
    targetMode: FeedMode,
    forceRefresh = false
  ): Promise<void> {
    if (!post?.id) return;

    const requestId = ++commentsRequestSeq;
    errorMsg = '';

    if (!cache[targetMode].comments.length) {
      loading = true;
    }

    try {
      const result = await nbaService.getRedditComments(post.id, sort, post.permalink, forceRefresh);
      if (requestId !== commentsRequestSeq || mode !== targetMode) return;

      cache[targetMode].comments = sortedCopy(result.comments ?? [], sortChoice);
      cache = { ...cache };
    } catch (error: unknown) {
      if (requestId !== commentsRequestSeq || mode !== targetMode) return;
      console.error('Failed to fetch comments:', error);
      errorMsg = error instanceof Error ? error.message : 'Failed to fetch comments';
    } finally {
      if (requestId === commentsRequestSeq && mode === targetMode) loading = false;
    }
  }

  async function ensureThreadAndComments(targetMode: FeedMode): Promise<void> {
    const sort: SortChoice = targetMode === 'POST' ? 'top' : 'new';

    try {
      const mapping = await nbaService.getRedditIndex();
      const entry = mapping[createPairKey(awayName, homeName)];
      let post = targetMode === 'POST' ? entry?.pgt : entry?.gdt;

      if (post) {
        cache[targetMode].thread = post;
        cache = { ...cache };
        await fetchCommentsFor(post, sort, targetMode);
        return;
      }

      if (!triedFetch[targetMode]) {
        triedFetch[targetMode] = true;
        if (!cache[targetMode].thread) loading = true;

        const result = await nbaService.searchRedditThread({
          type: targetMode === 'POST' ? 'post' : 'live',
          awayCandidates: [awayName],
          homeCandidates: [homeName]
        });
        post = result?.post ?? null;

        if (post) {
          cache[targetMode].thread = post;
          cache = { ...cache };
          await fetchCommentsFor(post, sort, targetMode);
        } else if (mode === targetMode) {
          cache[targetMode].thread = null;
          cache[targetMode].comments = [];
          cache = { ...cache };
          loading = false;
        }
      } else if (mode === targetMode && !cache[targetMode].thread) {
        cache[targetMode].comments = [];
        cache = { ...cache };
        loading = false;
      }
    } catch (error) {
      console.error(`Error ensuring ${targetMode} thread:`, error);
      if (mode === targetMode) loading = false;
    }
  }

  $: if (mode === 'LIVE' || mode === 'POST') {
    const defaultSort: SortChoice = mode === 'POST' ? 'top' : 'new';
    sortChoice = defaultSort;
    ensureThreadAndComments(mode);
  } else {
    loading = false;
  }

  function toggleTop(i: number): void {
    if (!currentMode) return;
    const comment = cache[currentMode].comments?.[i];
    if (!comment) return;
    comment._collapsed = !comment._collapsed;
    cache = { ...cache };
  }

  function toggleReply(i: number, j: number): void {
    if (!currentMode) return;
    const reply = cache[currentMode].comments?.[i]?.replies?.[j];
    if (!reply) return;
    reply._collapsed = !reply._collapsed;
    cache = { ...cache };
  }

  function toggleSub(i: number, j: number, k: number): void {
    if (!currentMode) return;
    const subReply = cache[currentMode].comments?.[i]?.replies?.[j]?.replies?.[k];
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
    cache[currentMode].comments = sortedCopy(cache[currentMode].comments, sortChoice);
    cache = { ...cache };
  }
  
  async function refreshComments(): Promise<void> {
    if (!currentMode) return;
    const post = cache[currentMode].thread;
    if (!post) return;
    const sort: SortChoice = currentMode === 'POST' ? 'top' : 'new';
    await fetchCommentsFor(post, sort, currentMode, true);
  }
</script>

<div>
  <div class="flex items-center justify-between mb-3">
    <div class="flex items-center gap-2 text-xs font-semibold">
      <button class="px-3 py-1 rounded {sortChoice === 'new' ? 'bg-white/25 text-white' : 'bg-black text-white border border-white/20'}" on:click={() => { sortChoice = 'new'; reorder(); }}>NEW</button>
      <button class="px-3 py-1 rounded {sortChoice === 'top' ? 'bg-white/25 text-white' : 'bg-black text-white border border-white/20'}" on:click={() => { sortChoice = 'top'; reorder(); }}>TOP</button>
      <button class="px-3 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white" on:click={refreshComments}>REFRESH</button>
    </div>
    {#if thread}
      <a class="text-white/70 hover:text-white underline" href={thread.url || (thread.permalink ? `https://www.reddit.com${thread.permalink}` : `https://www.reddit.com/comments/${thread.id}`)} target="_blank" rel="noopener noreferrer">Open Thread</a>
    {/if}
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
            <div class="mt-1 whitespace-pre-wrap">{c.body}</div>
            {#if c.replies && c.replies.length}
              <div class="mt-2 pl-3 border-l border-white/10 space-y-2">
                {#each c.replies as r, j (r.id || j)}
                  <div role="button" tabindex="0" class="w-full text-left cursor-pointer" on:click={(e) => { e.stopPropagation(); toggleReply(i, j); }} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); toggleReply(i, j); } }}>
                    <div class="text-sm text-white/70">
                      {r.author} - {r.score} - {formatTimeAgo(r.created_utc)} {r._collapsed ? '- collapsed' : ''}
                    </div>
                    {#if !r._collapsed}
                      <div class="whitespace-pre-wrap">{r.body}</div>
                      {#if r.replies && r.replies.length}
                        <div class="mt-2 pl-3 border-l border-white/10 space-y-2">
                          {#each r.replies as rr, k (rr.id || k)}
                            <div role="button" tabindex="0" class="w-full text-left cursor-pointer" on:click={(e) => { e.stopPropagation(); toggleSub(i, j, k); }} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); toggleSub(i, j, k); } }}>
                              <div class="text-sm text-white/70">
                                {rr.author} - {rr.score} - {formatTimeAgo(rr.created_utc)} {rr._collapsed ? '- collapsed' : ''}
                              </div>
                              {#if !rr._collapsed}
                                <div class="whitespace-pre-wrap">{rr.body}</div>
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
