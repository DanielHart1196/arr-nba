<script lang="ts">
  import { onMount } from 'svelte';
  export let eventId: string;
  export let names: string[] = [];
  export let players: { home: any[]; away: any[] };
  export let linescores: { home: any; away: any };

  let side: 'home' | 'away' = 'away';
  let mode: 'STATS' | 'LIVE' | 'POST' = 'STATS';

  onMount(() => {
    const s = localStorage.getItem(`arrnba.lastSide.${eventId}`);
    if (s === 'home' || s === 'away') side = s;
    mode = 'STATS';
  });

  function setSide(v: 'home' | 'away') {
    side = v;
    localStorage.setItem(`arrnba.lastSide.${eventId}`, v);
  }
  function setMode(v: 'STATS' | 'LIVE' | 'POST') {
    mode = v;
    localStorage.setItem(`arrnba.viewMode.${eventId}`, v);
  }

  $: roster = (players?.[side] ?? []);
  $: formattedLongest = Math.max(...roster.map((r: any) => (formatName(r?.name ?? '').length)), 6);
  $: nameColWidth = `${Math.min(formattedLongest, 13)}ch`;
  $: maxPeriods = Math.max(4, linescores?.home?.periods?.length ?? 0, linescores?.away?.periods?.length ?? 0);
  $: extraPeriods = Math.max(0, maxPeriods - 4);
  $: awayAb = abbr(linescores?.away?.team) || '';
  $: homeAb = abbr(linescores?.home?.team) || '';
  $: abLen = Math.max(awayAb.length, homeAb.length);
  $: lineNameColWidth = `${Math.min(Math.max(abLen, 3), 6)}ch`;
  $: gridCols = `${lineNameColWidth} 1fr repeat(4, 2.75rem) 2.75rem${extraPeriods>0?` repeat(${extraPeriods}, 2.75rem)`:''}`;

  const statCols = [
    'MIN','PTS','REB','AST','STL','BLK','OREB','DREB',
    'FGA','FGM','FG%','3PA','3PM','3P%','FTA','FTM','FT%',
    'PF','TO','+/-'
  ];

  function getStat(row: any, key: string) {
    if (key === 'FGA') return row.stats['FGM'];
    if (key === 'FGM') return row.stats['FGA'];
    if (key === 'FG%') return `${row.stats['FG%']}%`;
    if (key === '3PA') return row.stats['3PTM'];
    if (key === '3PM') return row.stats['3PTA'];
    if (key === '3P%') return `${row.stats['3PT%']}%`;
    if (key === 'FTA') return row.stats['FTM'];
    if (key === 'FTM') return row.stats['FTA'];
    if (key === 'FT%') return `${row.stats['FT%']}%`;
    return row.stats[key];
  }

  function abbr(team: any) {
    return team?.abbreviation || team?.shortDisplayName || (team?.displayName ? team.displayName.split(' ').map((w: string) => w[0]).join('').toUpperCase() : '');
  }

  $: statColWidth = '2.0rem';
  function formatName(n: string) {
    const parts = (n || '').split(' ').filter(Boolean);
    if (parts.length === 0) return n || '';
    const first = parts[0]?.[0] ? parts[0][0].toUpperCase() + '.' : '';
    const lastWord = parts.length > 1 ? parts[parts.length - 1] : '';
    const formatted = lastWord ? `${first} ${lastWord}` : parts[0];
    return formatted;
  }
  function sumKey(key: string) {
    return (players?.[side] ?? []).reduce((t: number, r: any) => {
      const mapKey = key === '3PA' ? '3PTA' : key === '3PM' ? '3PTM' : key;
      const v = Number(r?.stats?.[mapKey] ?? 0);
      return t + (isNaN(v) ? 0 : v);
    }, 0);
  }
  function pct(m: number, a: number) {
    return a > 0 ? Math.round((m / a) * 100) : 0;
  }
  function totalFor(key: string) {
    if (key === 'MIN') return '';
    if (key === '+/-') return '';
    if (key === 'FGA') return sumKey('FGA');
    if (key === 'FGM') return sumKey('FGM');
    if (key === 'FG%') return `${pct(sumKey('FGM'), sumKey('FGA'))}%`;
    if (key === '3PA') return sumKey('3PA');
    if (key === '3PM') return sumKey('3PM');
    if (key === '3P%') return `${pct(sumKey('3PM'), sumKey('3PA'))}%`;
    if (key === 'FTA') return sumKey('FTA');
    if (key === 'FTM') return sumKey('FTM');
    if (key === 'FT%') return `${pct(sumKey('FTM'), sumKey('FTA'))}%`;
    return sumKey(key);
  }
  let sx: number = 0;
  let sy: number = 0;
  let bx: boolean = false;
  function ts(e: TouchEvent) {
    const t = e.touches?.[0];
    if (!t) return;
    sx = t.clientX;
    sy = t.clientY;
    const el = e.target as HTMLElement;
    bx = !!el?.closest?.('[data-scrollable="true"]');
  }
  function te(e: TouchEvent) {
    const t = e.changedTouches?.[0];
    if (!t) return;
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (bx) return;
    if (Math.abs(dx) > 50 && Math.abs(dy) < 40) {
      if (mode === 'STATS') {
        if (dx > 0) setMode('LIVE');
        else setMode('POST');
      } else if (mode === 'LIVE') {
        if (dx < 0) setMode('STATS');
      } else if (mode === 'POST') {
        if (dx > 0) setMode('STATS');
      }
    }
  }
</script>

<div on:touchstart={ts} on:touchend={te}>
<div class="grid grid-cols-3 gap-2 mb-3">
  <div class="text-center">
    <button class="w-full py-2 font-semibold {mode==='LIVE' ? 'text-white' : 'text-white/70'}" on:click={() => setMode('LIVE')}>LIVE</button>
    <div class="{mode==='LIVE' ? 'bg-white' : 'bg-transparent'} h-0.5 w-full mt-2"></div>
  </div>
  <div class="text-center">
    <button class="w-full py-2 font-semibold {mode==='STATS' ? 'text-white' : 'text-white/70'}" on:click={() => setMode('STATS')}>STATS</button>
    <div class="{mode==='STATS' ? 'bg-white' : 'bg-transparent'} h-0.5 w-full mt-2"></div>
  </div>
  <div class="text-center">
    <button class="w-full py-2 font-semibold {mode==='POST' ? 'text-white' : 'text-white/70'}" on:click={() => setMode('POST')}>POST</button>
    <div class="{mode==='POST' ? 'bg-white' : 'bg-transparent'} h-0.5 w-full mt-2"></div>
  </div>
</div>

{#if mode === 'STATS'}
  <div class="mb-3 border border-white/10 rounded text-xs">
    <div class="grid" style="grid-template-columns: {gridCols}">
      <div class="sticky-col px-2 py-1 font-semibold text-left">TEAM</div>
      <div></div>
      {#each [1,2,3,4] as i}
        <div class="px-2 py-1 text-right font-semibold">Q{i}</div>
      {/each}
      <div class="px-2 py-1 text-right font-semibold">TOT</div>
      {#each Array(extraPeriods) as _, i}
        <div class="px-2 py-1 text-right font-semibold">OT{i+1}</div>
      {/each}
      <div class="sticky-col px-2 py-1 text-left">{abbr(linescores?.away?.team)}</div>
      <div></div>
      {#each [0,1,2,3] as i}
        <div class="px-2 py-1 text-right">{(linescores?.away?.periods?.[i] ?? '')}</div>
      {/each}
      <div class="px-2 py-1 text-right font-semibold">{linescores?.away?.total}</div>
      {#each Array(extraPeriods) as _, i}
        <div class="px-2 py-1 text-right">{(linescores?.away?.periods?.[i+4] ?? '')}</div>
      {/each}
      <div class="sticky-col px-2 py-1 text-left">{abbr(linescores?.home?.team)}</div>
      <div></div>
      {#each [0,1,2,3] as i}
        <div class="px-2 py-1 text-right">{(linescores?.home?.periods?.[i] ?? '')}</div>
      {/each}
      <div class="px-2 py-1 text-right font-semibold">{linescores?.home?.total}</div>
      {#each Array(extraPeriods) as _, i}
        <div class="px-2 py-1 text-right">{(linescores?.home?.periods?.[i+4] ?? '')}</div>
      {/each}
    </div>
  </div>
{/if}

{#if mode === 'STATS'}
  <div class="grid grid-cols-2 gap-2 mb-3">
    <button class="w-full py-2 rounded font-semibold {side==='away' ? 'bg-white/25 text-white' : 'bg-black text-white border border-white/20'}" on:click={() => setSide('away')}>{abbr(linescores?.away?.team)}</button>
    <button class="w-full py-2 rounded font-semibold {side==='home' ? 'bg-white/25 text-white' : 'bg-black text-white border border-white/20'}" on:click={() => setSide('home')}>{abbr(linescores?.home?.team)}</button>
  </div>
{/if}

{#if mode === 'STATS'}
  <div class="border border-white/10 rounded text-xs">
    <div class="grid" style="grid-template-columns: {nameColWidth} 1fr">
      <div>
        <div class="px-1 py-1 font-semibold text-left border-b-2 border-white/20">PLAYER</div>
        {#each roster as row, i}
          <div class="{i===5 ? 'border-t-2 border-white/20' : 'border-t border-white/5'} px-1 py-1 text-left truncate">{formatName(row.name)}</div>
        {/each}
        <div class="border-t-2 border-white/20 px-1 py-1 font-semibold text-left">TOTAL</div>
      </div>
      <div class="overflow-x-auto" data-scrollable="true">
        <div class="grid border-b-2 border-white/20" style="width:max-content; grid-template-columns: repeat({statCols.length}, {statColWidth})">
          {#each statCols as k}
            <div class="py-1 text-center font-semibold">{k}</div>
          {/each}
        </div>
        {#each roster as row, i}
          <div class="grid {i===5 ? 'border-t-2 border-white/20' : 'border-t border-white/5'}" style="width:max-content; grid-template-columns: repeat({statCols.length}, {statColWidth})">
            {#each statCols as k}
              <div class="py-1 text-center">{getStat(row, k)}</div>
            {/each}
          </div>
        {/each}
        <div class="grid border-t-2 border-white/20" style="width:max-content; grid-template-columns: repeat({statCols.length}, {statColWidth})">
          {#each statCols as k}
            <div class="py-1 text-center font-semibold">{totalFor(k)}</div>
          {/each}
        </div>
      </div>
    </div>
  </div>
{/if}
<div class="{mode==='STATS' ? 'hidden' : ''}">
  <slot name="reddit" {mode} {side}></slot>
</div>
</div>
