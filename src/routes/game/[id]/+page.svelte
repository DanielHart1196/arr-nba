<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import BoxScoreToggle from '$lib/components/BoxScoreToggle.svelte';
  import RedditFeedClient from '$lib/components/RedditFeedClient.svelte';
  export let data: any;
  let payload = data;
  let interval: any;
  async function refresh() {
    try {
      const res = await fetch(`/api/boxscore/${payload.id}`);
      const json = await res.json();
      payload = { id: payload.id, ...json };
    } catch {}
  }
  onMount(() => {
    interval = setInterval(refresh, 15000);
    const awayName = payload?.linescores?.away?.team?.displayName;
    const homeName = payload?.linescores?.home?.team?.displayName;
    function mascot(n) {
      const s = (n || '').toLowerCase();
      if (s.includes('trail blazers')) return 'Trail Blazers';
      return n;
    }
    const pairKey = [mascot(awayName), mascot(homeName)].sort().join('|');
    const globalCache = (window.__arrnba ||= { threads: new Map(), comments: new Map() });
    (async () => {
      try {
        const idxRes = await fetch('/api/reddit/index');
        const idxJson = await idxRes.json();
        const entry = idxJson?.mapping?.[pairKey];
        let liveThread = entry?.gdt;
        let postThread = entry?.pgt;
        if (!liveThread || !postThread) {
          const resLive = await fetch('/api/reddit/search', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'live', awayCandidates: [awayName], homeCandidates: [homeName] })
          });
          const jsonLive = await resLive.json();
          if (jsonLive?.post) liveThread = jsonLive.post;
          const resPost = await fetch('/api/reddit/search', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'post', awayCandidates: [awayName], homeCandidates: [homeName] })
          });
          const jsonPost = await resPost.json();
          if (jsonPost?.post) postThread = jsonPost.post;
        }
        if (liveThread) globalCache.threads.set(`${pairKey}|new|LIVE`, liveThread);
        if (postThread) globalCache.threads.set(`${pairKey}|top|POST`, postThread);
        if (liveThread) {
          const res = await fetch(`/api/reddit/comments/${liveThread.id}?sort=new&permalink=${encodeURIComponent(liveThread.permalink || '')}`);
          const json = await res.json();
          globalCache.comments.set(`${liveThread.id}|new`, json?.comments ?? []);
        }
        if (postThread) {
          const res = await fetch(`/api/reddit/comments/${postThread.id}?sort=top&permalink=${encodeURIComponent(postThread.permalink || '')}`);
          const json = await res.json();
          globalCache.comments.set(`${postThread.id}|top`, json?.comments ?? []);
        }
      } catch {}
    })();
  });
  onDestroy(() => {
    if (interval) clearInterval(interval);
  });
  function formatStatus(s: string) {
    const str = (s || '').trim();
    if (!str) return '';
    const m = /Q(\d)\s+([0-9:]+)/i.exec(str);
    if (m) {
      const q = m[1];
      const clock = m[2];
      return `${clock} Q${q}`;
    }
    return str.toUpperCase();
  }
  function logoAb(team: any): string {
    const raw = (team?.abbreviation || '').toUpperCase();
    const map: Record<string, string> = {
      SA: 'SAS',
      NO: 'NOP',
      GS: 'GSW',
      NY: 'NYK',
      PHO: 'PHX',
      WSH: 'WAS',
      UTAH: 'UTA'
    };
    const name = (team?.shortDisplayName || team?.displayName || '').toUpperCase();
    const nameMap: Record<string, string> = {
      'UTAH': 'UTA',
      'LOS ANGELES CLIPPERS': 'LAC',
      'LA CLIPPERS': 'LAC',
      'LOS ANGELES LAKERS': 'LAL',
      'LA LAKERS': 'LAL',
      'GOLDEN STATE': 'GSW',
      'NEW ORLEANS': 'NOP',
      'SAN ANTONIO': 'SAS',
      'NEW YORK': 'NYK',
      'PHOENIX': 'PHX',
      'WASHINGTON': 'WAS'
    };
    const ab = map[raw] || raw;
    if (!nameMap[name] && name.includes('UTAH')) return 'UTA';
    return nameMap[name] || ab || '';
  }
</script>

<div class="p-4">
  <button class="text-white/70 hover:text-white" on:click={() => history.back()}>← Back</button>
  <div class="mt-2 mb-4">
    {#if !payload?.error}
      {#if payload?.linescores}
        <div class="flex items-center justify-between text-lg font-semibold">
          <div class="flex items-center gap-2">
            <img
              src={`/logos/${logoAb(payload?.linescores?.away?.team)}.svg`}
              alt="away"
              width="28" height="28" loading="eager" decoding="async"
              on:error={(e)=>{(e.currentTarget as HTMLElement).style.display='none';}}
            />
            <span>{logoAb(payload?.linescores?.away?.team)}</span>
          </div>
          <span>{payload?.linescores?.away?.total} - {payload?.linescores?.home?.total}</span>
          <div class="flex items-center gap-2">
            <span>{logoAb(payload?.linescores?.home?.team)}</span>
            <img
              src={`/logos/${logoAb(payload?.linescores?.home?.team)}.svg`}
              alt="home"
              width="28" height="28" loading="eager" decoding="async"
              on:error={(e)=>{(e.currentTarget as HTMLElement).style.display='none';}}
            />
          </div>
        </div>
        <div class="text-center text-white/70 text-sm mt-1">
          {#if payload?.status?.name && payload?.status?.name?.toUpperCase()?.includes('FINAL')}
            FINAL
          {:else if payload?.status?.short}
            {formatStatus(payload?.status?.short)}
          {:else}
            {formatStatus(payload?.status?.clock && payload?.status?.period ? `Q${payload?.status?.period} ${payload?.status?.clock}` : '')}
          {/if}
        </div>
      {/if}
    {/if}
  </div>
  {#if payload?.error}
    <div class="text-red-400">{payload.error}</div>
  {:else}
    <BoxScoreToggle eventId={payload.id} names={payload.names} players={payload.players} linescores={payload.linescores}>
      <div slot="reddit" let:mode let:side>
        <RedditFeedClient eventId={payload.id}
          awayName={payload?.linescores?.away?.team?.displayName} homeName={payload?.linescores?.home?.team?.displayName} {mode} />
      </div>
    </BoxScoreToggle>
  {/if}
</div>
