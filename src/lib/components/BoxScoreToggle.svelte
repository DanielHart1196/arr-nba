<script lang="ts">
  import { onMount } from 'svelte';
  import { createTouchGestures } from '../composables/touch-gestures';
  import { getTeamLogoAbbr } from '../utils/team.utils';
  import StatsTable from './stats/StatsTable.svelte';
  import LinescoreTable from './stats/LinescoreTable.svelte';
  import type { Player, Team } from '../types/nba';
  
  export let eventId: string;
  export let players: { home: Player[]; away: Player[] };
  export let linescores: { home: { team: Team; periods: number[]; total: number }; away: { team: Team; periods: number[]; total: number } };

  let side: 'home' | 'away' = 'away';
  let mode: 'STATS' | 'LIVE' | 'POST' = 'STATS';

  onMount(() => {
    side = 'away';
    mode = 'STATS';
    
    // Find the scrollable element for debugging
    scrollLeftElement = document.querySelector('[data-scrollable="true"]') as HTMLElement;
    
    if (scrollLeftElement) {
      // Initial scroll position check
      checkScrollPosition();
      
      // Add scroll listener
      scrollLeftElement.addEventListener('scroll', checkScrollPosition);
    }
  });

  function setSide(v: 'home' | 'away') {
    side = v;
    localStorage.setItem(`arrnba.lastSide.${eventId}`, v);
  }
  
  function setMode(v: 'STATS' | 'LIVE' | 'POST') {
    mode = v;
    localStorage.setItem(`arrnba.viewMode.${eventId}`, v);
  }

  // Touch gestures with scroll awareness
  let scrollLeftElement: HTMLElement;
  let isFullyScrolledLeft = false;
  let isFullyScrolledRight = false;

  function checkScrollPosition() {
    if (!scrollLeftElement) return;
    
    const { scrollLeft, scrollWidth, clientWidth } = scrollLeftElement;
    isFullyScrolledLeft = scrollLeft === 0;
    isFullyScrolledRight = scrollLeft + clientWidth >= scrollWidth - 1; // 1px tolerance
  }

  // Touch gestures with scroll awareness
  createTouchGestures({
    onSwipeRight: () => {
      // Simplified logic - touch gestures now handle scrollable detection
      if (mode === 'STATS') {
        setMode('LIVE');
      } else if (mode === 'LIVE') {
        setMode('POST');
      } else if (mode === 'POST') {
        setMode('STATS');
      }
    },
    onSwipeLeft: () => {
      // Simplified logic - touch gestures now handle scrollable detection
      if (mode === 'STATS') {
        setMode('POST');
      } else if (mode === 'POST') {
        setMode('LIVE');
      } else if (mode === 'LIVE') {
        setMode('STATS');
      }
    },
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
