<script>
  import { onMount } from 'svelte';
  import { nbaService } from '../services/nba.service';

  export let awayName;
  export let homeName;
  export let mode;

  let sortChoice = 'new';
  let loading = false;
  let errorMsg = '';
  let triedFetch = { LIVE: false, POST: false };

  // Local cache for switching between views instantly
  let cache = {
    LIVE: { thread: null, comments: [] },
    POST: { thread: null, comments: [] }
  };

  $: thread = cache[mode]?.thread;
  $: comments = cache[mode]?.comments;

  function mascot(n) {
    const s = (n || '').toLowerCase();
    if (s.includes('trail blazers')) return 'Trail Blazers';
    return n;
  }
  function pairKey() {
    return [mascot(awayName), mascot(homeName)].sort().join('|');
  }

  async function fetchCommentsFor(t, sort, m) {
    if (!t) return;
    
    errorMsg = '';
    // Check cache first to avoid showing "Loading..." if data is already there
    const cached = await nbaService.getRedditComments(t.id, sort, t.permalink);
    if (cached && cached.comments && cached.comments.length > 0) {
      cache[m].comments = sortedCopy(cached.comments, sort === 'top' ? 'top' : 'new');
      cache = { ...cache };
    } else if (!cache[m].comments.length) {
      loading = true;
    }

    try {
      const res = await nbaService.getRedditComments(t.id, sort, t.permalink);
      if (res.error) errorMsg = res.error;
      
      if (mode === m) {
        cache[m].comments = sortedCopy(res.comments ?? [], sort === 'top' ? 'top' : 'new');
        cache = { ...cache };
      }
    } catch (err) {
      console.error('Failed to fetch comments:', err);
      errorMsg = err.message || 'Failed to fetch comments';
    } finally {
      if (mode === m) loading = false;
    }
  }
  async function ensureThreadAndComments(m) {
    const sort = m === 'POST' ? 'top' : 'new';
    
    try {
      // 1. Try to get from index first
      const mapping = await nbaService.getRedditIndex();
      const entry = mapping[pairKey()];
      let t = m === 'POST' ? entry?.pgt : entry?.gdt;

      if (t) {
        cache[m].thread = t;
        cache = { ...cache };
        await fetchCommentsFor(t, sort, m);
        return;
      }

      // 2. If not in index, search for it
      if (!triedFetch[m]) {
        triedFetch[m] = true;
        // Check if we should show loading for search
        if (!cache[m].thread) loading = true;
        
        const res = await nbaService.searchRedditThread({
          type: m === 'POST' ? 'post' : 'live',
          awayCandidates: [awayName],
          homeCandidates: [homeName]
        });
        const found = res?.post;
        if (found) {
          cache[m].thread = found;
          cache = { ...cache };
          await fetchCommentsFor(found, sort, m);
        } else {
          if (mode === m) {
            cache[m].thread = null;
            cache[m].comments = [];
            cache = { ...cache };
            loading = false;
          }
        }
      } else {
        // If we already tried fetching and found nothing, ensure UI reflects that
        if (mode === m && !cache[m].thread) {
          cache[m].comments = [];
          cache = { ...cache };
          loading = false;
        }
      }
    } catch (err) {
      console.error(`Error ensuring ${m} thread:`, err);
      if (mode === m) loading = false;
    }
  }

  function ago(ts) {
    const now = Math.floor(Date.now() / 1000);
    const diff = Math.max(0, now - (Number(ts) || 0));
    if (diff < 60) return 'just now';
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }

  $: if (mode === 'LIVE' || mode === 'POST') {
    const msort = mode === 'POST' ? 'top' : 'new';
    sortChoice = msort;
    // We do NOT clear cache[mode] here, just trigger fetch to update it if needed.
    ensureThreadAndComments(mode);
  } else {
    loading = false;
  }

  function toggleTop(i) {
    const c = cache[mode].comments?.[i];
    if (!c) return;
    c._collapsed = !c._collapsed;
    cache = { ...cache };
  }
  function toggleReply(i, j) {
    const r = cache[mode].comments?.[i]?.replies?.[j];
    if (!r) return;
    r._collapsed = !r._collapsed;
    cache = { ...cache };
  }
  function toggleSub(i, j, k) {
    const rr = cache[mode].comments?.[i]?.replies?.[j]?.replies?.[k];
    if (!rr) return;
    rr._collapsed = !rr._collapsed;
    cache = { ...cache };
  }
  function sortedCopy(base, choice) {
    const cmp = (a, b) => {
      if (choice === 'top') return (b?.score ?? 0) - (a?.score ?? 0);
      return (b?.created_utc ?? 0) - (a?.created_utc ?? 0);
    };
    function cloneAndSort(arr) {
      const copy = (arr || []).map((n) => ({
        ...n,
        replies: cloneAndSort(n?.replies || [])
      }));
      copy.sort(cmp);
      return copy;
    }
    return cloneAndSort(base || []);
  }
  function reorder() {
    cache[mode].comments = sortedCopy(cache[mode].comments, sortChoice);
    cache = { ...cache };
  }
  
  async function refreshComments() {
    const t = cache[mode].thread;
    if (!t) return;
    loading = true;
    errorMsg = '';
    try {
      const sort = mode === 'POST' ? 'top' : 'new';
      const res = await nbaService.getRedditComments(t.id, sort, t.permalink, true);
      if (res.error) errorMsg = res.error;
      cache[mode].comments = sortedCopy(res.comments ?? [], sortChoice);
      cache = { ...cache };
      loading = false;
    } catch (error) {
      console.error('Failed to refresh comments:', error);
      errorMsg = error.message || 'Failed to refresh comments';
      loading = false;
    }
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
            {c.author} • {c.score} • {ago(c.created_utc)} {c._collapsed ? '• collapsed' : ''}
          </div>
          {#if !c._collapsed}
            <div class="mt-1 whitespace-pre-wrap">{c.body}</div>
            {#if c.replies && c.replies.length}
              <div class="mt-2 pl-3 border-l border-white/10 space-y-2">
                {#each c.replies as r, j (r.id || j)}
                  <div role="button" tabindex="0" class="w-full text-left cursor-pointer" on:click={(e) => { e.stopPropagation(); toggleReply(i, j); }} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); toggleReply(i, j); } }}>
                    <div class="text-sm text-white/70">
                      {r.author} • {r.score} • {ago(r.created_utc)} {r._collapsed ? '• collapsed' : ''}
                    </div>
                    {#if !r._collapsed}
                      <div class="whitespace-pre-wrap">{r.body}</div>
                      {#if r.replies && r.replies.length}
                        <div class="mt-2 pl-3 border-l border-white/10 space-y-2">
                          {#each r.replies as rr, k (rr.id || k)}
                            <div role="button" tabindex="0" class="w-full text-left cursor-pointer" on:click={(e) => { e.stopPropagation(); toggleSub(i, j, k); }} on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); toggleSub(i, j, k); } }}>
                              <div class="text-sm text-white/70">
                                {rr.author} • {rr.score} • {ago(rr.created_utc)} {rr._collapsed ? '• collapsed' : ''}
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

 
