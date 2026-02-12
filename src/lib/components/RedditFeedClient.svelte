<script>
  import { onMount } from 'svelte';
  export let awayName;
  export let homeName;
  export let mode;

  let sortChoice = 'new';
  let mapping = {};
  let comments = [];
  let thread;
  let loading = false;
  let threadsByMode = { LIVE: null, POST: null };

  let cacheThreads = new Map();
  let cacheComments = new Map();
  let watchTimer = null;
  let lastKey = '';

  function mascot(n) {
    const s = (n || '').toLowerCase();
    if (s.includes('trail blazers')) return 'Trail Blazers';
    return n;
  }
  function pairKey() {
    return [mascot(awayName), mascot(homeName)].sort().join('|');
  }
  $: (() => {
    try {
      const g = (window).__arrnba ||= { threads: new Map(), comments: new Map() };
      cacheThreads = g.threads;
      cacheComments = g.comments;
    } catch {}
  })();
  function threadForMode(m) {
    const s = m === 'POST' ? 'top' : 'new';
    const key = `${pairKey()}|${s}|${m}`;
    return cacheThreads.get(key) || null;
  }

  onMount(() => {
    const lt = threadForMode('LIVE');
    const pt = threadForMode('POST');
    const msort = mode === 'POST' ? 'top' : 'new';
    sortChoice = msort;
    if (mode === 'LIVE' && lt) {
      thread = lt;
      const ckey = `${thread.id}|${msort}`;
      const base = cacheComments.get(ckey) || [];
      comments = sortedCopy(base, sortChoice);
    } else if (mode === 'POST' && pt) {
      thread = pt;
      const ckey = `${thread.id}|${msort}`;
      const base = cacheComments.get(ckey) || [];
      comments = sortedCopy(base, sortChoice);
    }
    loading = false;
  });

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
    const t = threadForMode(mode);
    const msort = mode === 'POST' ? 'top' : 'new';
    sortChoice = msort;
    if (t) {
      thread = t;
      const ckey = `${thread.id}|${msort}`;
      lastKey = ckey;
      if (cacheComments.has(ckey)) {
        const base = cacheComments.get(ckey) || [];
        comments = sortedCopy(base, sortChoice);
        loading = false;
        if (watchTimer) { clearInterval(watchTimer); watchTimer = null; }
      } else {
        loading = true;
        if (watchTimer) { clearInterval(watchTimer); watchTimer = null; }
        watchTimer = setInterval(() => {
          const tt = threadForMode(mode);
          if (!tt) return;
          const keyNow = `${tt.id}|${sortChoice === 'top' ? 'top' : 'new'}`;
          if (cacheComments.has(keyNow)) {
            thread = tt;
            const baseNow = cacheComments.get(keyNow) || [];
            comments = sortedCopy(baseNow, sortChoice);
            loading = false;
            clearInterval(watchTimer);
            watchTimer = null;
          }
        }, 200);
      }
    } else {
      loading = true;
      if (watchTimer) { clearInterval(watchTimer); watchTimer = null; }
      watchTimer = setInterval(() => {
        const tt = threadForMode(mode);
        if (!tt) return;
        const keyNow = `${tt.id}|${sortChoice === 'top' ? 'top' : 'new'}`;
        if (cacheComments.has(keyNow)) {
          thread = tt;
          const baseNow = cacheComments.get(keyNow) || [];
          comments = sortedCopy(baseNow, sortChoice);
          loading = false;
          clearInterval(watchTimer);
          watchTimer = null;
        }
      }, 200);
    }
  }

  function toggleTop(i) {
    const c = comments?.[i];
    if (!c) return;
    c._collapsed = !c._collapsed;
    comments = [...comments];
  }
  function toggleReply(i, j) {
    const r = comments?.[i]?.replies?.[j];
    if (!r) return;
    r._collapsed = !r._collapsed;
    comments = [...comments];
  }
  function toggleSub(i, j, k) {
    const rr = comments?.[i]?.replies?.[j]?.replies?.[k];
    if (!rr) return;
    rr._collapsed = !rr._collapsed;
    comments = [...comments];
  }
  function topKey(c, i) {
    return c?.id || `c_${i}`;
  }
  function replyKey(r, i, j) {
    return r?.id || `c_${i}_r_${j}`;
  }
  function subReplyKey(rr, i, j, k) {
    return rr?.id || `c_${i}_r_${j}_rr_${k}`;
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
    comments = sortedCopy(comments, sortChoice);
  }
</script>

<div>
  <div class="flex items-center justify-between mb-3">
    <div class="flex items-center gap-2">
      <button class="px-3 py-1 rounded bg-white/10" on:click={() => { sortChoice = 'new'; reorder(); }}>New</button>
      <button class="px-3 py-1 rounded bg-white/10" on:click={() => { sortChoice = 'top'; reorder(); }}>Top</button>
    </div>
    {#if thread}
      <a class="text-white/70 hover:text-white underline" href={thread.url || (thread.permalink ? `https://www.reddit.com${thread.permalink}` : `https://www.reddit.com/comments/${thread.id}`)} target="_blank" rel="noopener noreferrer">Open Thread</a>
    {/if}
  </div>
  {#if loading}
    <div class="text-white/70">Loading comments...</div>
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

 
