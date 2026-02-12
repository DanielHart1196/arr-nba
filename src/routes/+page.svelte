<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  export let data: { events: any[] };
  let events = data.events ?? [];
  let interval: any;
  async function prewarmBoxscores(list: any[]) {
    try {
      const ids: string[] = (list ?? []).map((e: any) => String(e?.id || '')).filter(Boolean);
      if (ids.length === 0) return;
      await Promise.allSettled(ids.map((id) => fetch(`/api/boxscore/${id}`)));
    } catch {}
  }

  async function refresh() {
    try {
      const res = await fetch('/api/scoreboard');
      const json = await res.json();
      events = json?.events ?? [];
      prewarmBoxscores(events);
    } catch {}
  }

  onMount(() => {
    interval = setInterval(refresh, 15000);
    prewarmBoxscores(events);
    (async () => {
      try {
        const res = await fetch('/api/reddit/index');
        const json = await res.json();
        const mapping = json?.mapping ?? {};
        const g = (window as any).__arrnba ||= { threads: new Map(), comments: new Map(), mapping: {} };
        g.mapping = mapping;
        function mascot(n: string) {
          const s = (n || '').toLowerCase();
          if (s.includes('trail blazers')) return 'Trail Blazers';
          return n;
        }
        for (const e of events || []) {
          const away = e?.competitions?.[0]?.competitors?.find((c: any)=>c.homeAway==='away')?.team?.displayName || '';
          const home = e?.competitions?.[0]?.competitors?.find((c: any)=>c.homeAway==='home')?.team?.displayName || '';
          const pairKey = [mascot(away), mascot(home)].sort().join('|');
          const entry = mapping?.[pairKey];
          if (!entry) continue;
          if (entry?.gdt) g.threads.set(`${pairKey}|new|LIVE`, entry.gdt);
          if (entry?.pgt) g.threads.set(`${pairKey}|top|POST`, entry.pgt);
        }
      } catch {}
    })();
  });
  onDestroy(() => {
    if (interval) clearInterval(interval);
  });

  function stateBadge(event: any) {
    const comp = event?.competitions?.[0];
    const status = comp?.status?.type?.description ?? '';
    return status;
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
  <h1 class="text-2xl font-semibold mb-4">ARR NBA</h1>
  {#if !events || events.length === 0}
    <div class="text-white/70">No games found…</div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {#each events as e}
        <a href={`/game/${e.id}`} sveltekit:prefetch class="block border border-white/10 rounded p-3 hover:border-white/20">
          <div class="grid grid-cols-5 grid-rows-2 gap-x-3 items-center">
            <div class="row-span-2 justify-self-center">
              <img
                src={`/logos/${logoAb(e?.competitions?.[0]?.competitors?.find((c)=>c.homeAway==='away')?.team)}.svg`}
                alt="away"
                width="48" height="48" loading="lazy" decoding="async"
                on:error={(e)=>{(e.currentTarget as HTMLElement).style.display='none';}}
              />
            </div>
            <div class="text-center font-medium">
              {logoAb(e?.competitions?.[0]?.competitors?.find((c)=>c.homeAway==='away')?.team)}
            </div>
            <div class="text-center text-white/70 font-medium">@</div>
            <div class="text-center font-medium">
              {logoAb(e?.competitions?.[0]?.competitors?.find((c)=>c.homeAway==='home')?.team)}
            </div>
            <div class="row-span-2 justify-self-center">
              <img
                src={`/logos/${logoAb(e?.competitions?.[0]?.competitors?.find((c)=>c.homeAway==='home')?.team)}.svg`}
                alt="home"
                width="48" height="48" loading="lazy" decoding="async"
                on:error={(e)=>{(e.currentTarget as HTMLElement).style.display='none';}}
              />
            </div>
            <div class="text-right">
              {e?.competitions?.[0]?.competitors?.find((c)=>c.homeAway==='away')?.score}
            </div>
            <div class="text-center text-white/70">
              {e?.competitions?.[0]?.status?.type?.shortDetail}
            </div>
            <div class="text-left">
              {e?.competitions?.[0]?.competitors?.find((c)=>c.homeAway==='home')?.score}
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
