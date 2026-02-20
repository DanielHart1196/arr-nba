<script lang="ts">
  import { onMount } from 'svelte';
  import { createTouchGestures } from '../composables/touch-gestures';
  import StatsTable from './stats/StatsTable.svelte';
  import LinescoreTable from './stats/LinescoreTable.svelte';
  import type { Player, Team } from '../types/nba';
  
  export let players: { home: Player[]; away: Player[] };
  export let linescores: { home: { team: Team; periods: number[]; total: number }; away: { team: Team; periods: number[]; total: number } };

  const MODE_ORDER = ['LIVE', 'STATS', 'POST'] as const;
  type ViewMode = (typeof MODE_ORDER)[number];
  type TeamSide = 'home' | 'away';

  export let initialMode: ViewMode = 'STATS';
  export let initialSide: TeamSide = 'away';
  export let onViewStateChange: (state: { mode: ViewMode; side: TeamSide }) => void = () => {};

  let side: TeamSide = 'away';
  let mode: ViewMode = 'STATS';
  let currentIndex = 1;
  let panelWidth = 0;
  let dragOffsetPx = 0;
  let isDragging = false;
  let trackAnimating = false;
  let suppressInitialTrackAnimation = true;
  let modeContainer: HTMLElement;

  function clampIndex(i: number): number {
    return Math.max(0, Math.min(MODE_ORDER.length - 1, i));
  }

  function indexOfMode(v: ViewMode): number {
    return MODE_ORDER.indexOf(v);
  }

  function applyIndex(index: number): void {
    const safe = clampIndex(index);
    currentIndex = safe;
    mode = MODE_ORDER[safe];
  }

  function setSide(v: 'home' | 'away') {
    if (side === v) return;
    side = v;
  }
  
  function setMode(v: ViewMode) {
    if (mode === v) return;
    applyIndex(indexOfMode(v));
  }

  function snapToIndex(index: number): void {
    if (trackAnimating) return;
    const next = clampIndex(index);
    if (next === currentIndex) {
      isDragging = false;
      dragOffsetPx = 0;
      return;
    }
    trackAnimating = true;
    isDragging = false;
    applyIndex(next);
    dragOffsetPx = 0;
    setTimeout(() => {
      trackAnimating = false;
    }, 180);
  }

  function handleSwipeDrag(deltaX: number): void {
    if (trackAnimating) return;
    const width = Math.max(panelWidth, 280);
    const clamped = Math.max(-width * 0.85, Math.min(width * 0.85, deltaX));
    isDragging = true;
    dragOffsetPx = clamped;
  }

  function handleGestureEnd(didSwipe: boolean): void {
    if (trackAnimating) return;
    if (didSwipe) return;
    const width = Math.max(panelWidth, 280);
    const threshold = width * 0.28;
    if (dragOffsetPx <= -threshold) {
      snapToIndex(currentIndex + 1);
      return;
    }
    if (dragOffsetPx >= threshold) {
      snapToIndex(currentIndex - 1);
      return;
    }
    isDragging = false;
    dragOffsetPx = 0;
  }

  onMount(() => {
    side = initialSide === 'home' ? 'home' : 'away';
    applyIndex(indexOfMode(initialMode));

    const gestures = createTouchGestures({
      target: modeContainer,
      onSwipeRight: () => snapToIndex(currentIndex - 1),
      onSwipeLeft: () => snapToIndex(currentIndex + 1),
      onHorizontalDrag: handleSwipeDrag,
      onGestureEnd: handleGestureEnd,
      lockHorizontalSwipeAfterVerticalScroll: true,
      lockHorizontalSwipeAfterInnerHorizontalScroll: true,
      threshold: 50
    });

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        suppressInitialTrackAnimation = false;
      });
    });

    return () => {
      gestures.destroy();
    };
  });

  function abbr(team: Team) {
    return team?.abbreviation || team?.shortDisplayName || (team?.displayName ? team.displayName.split(' ').map((w: string) => w[0]).join('').toUpperCase() : '');
  }

  $: roster = (players?.[side] ?? []);
  $: awayAb = (linescores?.away?.team ? abbr(linescores.away.team) : '');
  $: homeAb = (linescores?.home?.team ? abbr(linescores.home.team) : '');
  $: onViewStateChange({ mode, side });
</script>

<div bind:this={modeContainer} class="swipe-area h-full min-h-[55vh]" style="touch-action: pan-y;">
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

<div class="relative overflow-x-hidden min-h-[40vh]" bind:clientWidth={panelWidth}>
  <div
    class="flex"
    style="width: {(panelWidth || 1) * MODE_ORDER.length}px; transform: translate3d({(-currentIndex * (panelWidth || 1)) + dragOffsetPx}px, 0, 0); transition: {(isDragging || suppressInitialTrackAnimation) ? 'none' : 'transform 180ms ease-out'};"
  >
    {#each MODE_ORDER as paneMode, i}
      <div class="shrink-0 min-w-0" style="width: {panelWidth || 1}px;">
        {#if paneMode === mode}
          {#if paneMode === 'STATS'}
            {#if linescores}
              <LinescoreTable {linescores} />
              <div class="grid grid-cols-2 gap-2 mb-2 swipe-area">
                <button class="w-full py-2 rounded font-semibold {side==='away' ? 'bg-white/25 text-white' : 'bg-black text-white border border-white/20'}" on:click={() => setSide('away')}>{awayAb}</button>
                <button class="w-full py-2 rounded font-semibold {side==='home' ? 'bg-white/25 text-white' : 'bg-black text-white border border-white/20'}" on:click={() => setSide('home')}>{homeAb}</button>
              </div>
            {/if}
            {#if players}
              <StatsTable players={roster} />
            {/if}
          {:else}
            <div class="swipe-area min-w-0 overflow-x-hidden">
              <slot name="reddit" mode={paneMode} {side}></slot>
            </div>
          {/if}
        {/if}
      </div>
    {/each}
  </div>
</div>
</div>
