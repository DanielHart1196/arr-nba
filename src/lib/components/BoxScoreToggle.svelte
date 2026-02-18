<script lang="ts">
  import { onMount } from 'svelte';
  import { createTouchGestures } from '../composables/touch-gestures';
  import StatsTable from './stats/StatsTable.svelte';
  import LinescoreTable from './stats/LinescoreTable.svelte';
  import type { Player, Team } from '../types/nba';
  
  export let eventId: string;
  export let players: { home: Player[]; away: Player[] };
  export let linescores: { home: { team: Team; periods: number[]; total: number }; away: { team: Team; periods: number[]; total: number } };

  let side: 'home' | 'away' = 'away';
  let mode: 'STATS' | 'LIVE' | 'POST' = 'STATS';

  onMount(() => {
    try {
      const savedSide = localStorage.getItem(`arrnba.lastSide.${eventId}`);
      if (savedSide === 'home' || savedSide === 'away') {
        side = savedSide;
      }
      const savedMode = localStorage.getItem(`arrnba.viewMode.${eventId}`);
      if (savedMode === 'STATS' || savedMode === 'LIVE' || savedMode === 'POST') {
        mode = savedMode;
      }
    } catch {}
  });

  function setSide(v: 'home' | 'away') {
    if (side === v) return;
    side = v;
    try {
      localStorage.setItem(`arrnba.lastSide.${eventId}`, v);
    } catch {}
  }
  
  function setMode(v: 'STATS' | 'LIVE' | 'POST') {
    if (mode === v) return;
    mode = v;
    try {
      localStorage.setItem(`arrnba.viewMode.${eventId}`, v);
    } catch {}
  }

  function cycleMode(direction: 'left' | 'right') {
    if (direction === 'right') {
      if (mode === 'STATS') setMode('LIVE');
      else if (mode === 'LIVE') setMode('POST');
      else setMode('STATS');
      return;
    }

    if (mode === 'STATS') setMode('POST');
    else if (mode === 'POST') setMode('LIVE');
    else setMode('STATS');
  }

  createTouchGestures({
    onSwipeRight: () => cycleMode('right'),
    onSwipeLeft: () => cycleMode('left'),
    threshold: 50
  });

  function abbr(team: Team) {
    return team?.abbreviation || team?.shortDisplayName || (team?.displayName ? team.displayName.split(' ').map((w: string) => w[0]).join('').toUpperCase() : '');
  }

  $: roster = (players?.[side] ?? []);
  $: awayAb = (linescores?.away?.team ? abbr(linescores.away.team) : '');
  $: homeAb = (linescores?.home?.team ? abbr(linescores.home.team) : '');
</script>

<div>
<div class="grid grid-cols-3 gap-2 mb-2 swipe-area">
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

{#if mode === 'STATS' && linescores}
  <LinescoreTable {linescores} />
{/if}

{#if mode === 'STATS' && linescores}
  <div class="grid grid-cols-2 gap-2 mb-2 swipe-area">
    <button class="w-full py-2 rounded font-semibold {side==='away' ? 'bg-white/25 text-white' : 'bg-black text-white border border-white/20'}" on:click={() => setSide('away')}>{awayAb}</button>
    <button class="w-full py-2 rounded font-semibold {side==='home' ? 'bg-white/25 text-white' : 'bg-black text-white border border-white/20'}" on:click={() => setSide('home')}>{homeAb}</button>
  </div>
{/if}

{#if mode === 'STATS' && players}
  <StatsTable players={roster} />
{/if}
<div class="{mode==='STATS' ? 'hidden' : ''} swipe-area">
  <slot name="reddit" {mode} {side}></slot>
</div>
</div>
