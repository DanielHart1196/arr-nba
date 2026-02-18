<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { nbaService } from '../lib/services/nba.service';
  import { prewarmRedditForMatch } from '../lib/services/reddit-prewarm.service';
  import { getTeamLogoAbbr } from '../lib/utils/team.utils';
  import { addDays, getEventTeamDisplayNames, isEventOnDate, mergeUniqueAndSortEvents, toScoreboardDateKey } from '../lib/utils/scoreboard.utils';
  import { createTouchGestures } from '../lib/composables/touch-gestures';
  import type { Event as NBAEvent } from '../lib/types/nba';
  
  export let data: { events: NBAEvent[] };
  let events = data.events ?? [];
  let interval: any;
  let refreshInFlight = false;
  let selectedDate = new Date();

  async function refresh() {
    if (refreshInFlight) return;
    refreshInFlight = true;

    try {
      const targetDateStr = selectedDate.toDateString();
      
      // Save date to sessionStorage so it's remembered when coming back
      try {
        sessionStorage.setItem('arrnba.selectedDate', selectedDate.toISOString());
      } catch (e) {}
      
      // Calculate the three US days we need to check to cover our local day
      const currentDay = new Date(selectedDate);
      const prevDay = addDays(selectedDate, -1);
      const nextDay = addDays(selectedDate, 1);
      const isOnTargetDay = (event: NBAEvent) => isEventOnDate(event, targetDateStr);

      // 1. Check if we already have the main day in cache to avoid layout flicker
      const cached = await nbaService.getScoreboard(toScoreboardDateKey(currentDay));
      if (cached && cached.events) {
        // If we have any data cached for today, show it immediately while background fetch completes the 3-day window
        events = (cached.events ?? []).filter(isOnTargetDay);
      }

      // 2. Fetch all three days in parallel for maximum speed
      const [response, prevResponse, nextResponse] = await Promise.all([
        nbaService.getScoreboard(toScoreboardDateKey(currentDay)),
        nbaService.getScoreboard(toScoreboardDateKey(prevDay)),
        nbaService.getScoreboard(toScoreboardDateKey(nextDay))
      ]);
      
      const fromCurrent = (response.events ?? []).filter(isOnTargetDay);
      const fromPrev = (prevResponse.events ?? []).filter(isOnTargetDay);
      const fromNext = (nextResponse.events ?? []).filter(isOnTargetDay);

      // Combine and deduplicate
      const allMatches = [...fromPrev, ...fromCurrent, ...fromNext];
      events = mergeUniqueAndSortEvents(allMatches);
      prewarmBoxscores(events);
      
      // Pre-warm the adjacent days in the background to make next swipes instant
      const dayAfter = addDays(selectedDate, 2); // We already fetched selectedDate + 1
      const dayBefore = addDays(selectedDate, -2); // We already fetched selectedDate - 1
      
      nbaService.getScoreboard(toScoreboardDateKey(dayAfter)).catch(() => {});
      nbaService.getScoreboard(toScoreboardDateKey(dayBefore)).catch(() => {});

    } catch (error) {
      console.error('Failed to refresh scoreboard:', error);
    } finally {
      refreshInFlight = false;
    }
  }

  function changeDate(delta: number) {
    selectedDate.setDate(selectedDate.getDate() + delta);
    selectedDate = new Date(selectedDate);
    refresh();
  }

  function formatDateDisplay(date: Date) {
    return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  }
  
  // Preload Reddit data when user hovers or taps on a game
  let prewarmTimeout: any;
  async function prewarmRedditData(event: NBAEvent) {
    // Clear any pending prewarm to avoid spamming during swipes
    if (prewarmTimeout) clearTimeout(prewarmTimeout);
    
    // Delay pre-warming slightly. If it's a swipe, this will be cancelled or ignored.
    prewarmTimeout = setTimeout(async () => {
      const teams = getEventTeamDisplayNames(event);
      if (!teams) return;
      const { awayName, homeName } = teams;
      
      try {
        await prewarmRedditForMatch(nbaService, awayName, homeName);
      } catch (error) {
        console.error(`Failed to preload Reddit data for ${awayName} vs ${homeName}:`, error);
      }
    }, 150); // 150ms delay to differentiate tap/hover from swipe
  }

  async function prewarmBoxscores(eventList: NBAEvent[]) {
    try {
      const ids = eventList.map(e => e.id).filter(Boolean);
      if (ids.length === 0) return;
      nbaService.prewarmBoxscores(ids).catch(() => {});
    } catch (error) {
      console.error('Failed to prewarm boxscores:', error);
    }
  }

  let scoreboardContainer: HTMLElement;
  onMount(() => {
    // Restore saved date if exists
    try {
      const savedDate = sessionStorage.getItem('arrnba.selectedDate');
      if (savedDate) {
        selectedDate = new Date(savedDate);
      }
      const v = localStorage.getItem('arrnba.hideScores');
      hideScores = v === '1';
    } catch (e) {}

    interval = setInterval(refresh, 15000);
    
    // Enable swiping between dates
    createTouchGestures({
      target: scoreboardContainer,
      onSwipeRight: () => changeDate(-1),
      onSwipeLeft: () => changeDate(1),
      threshold: 50
    });

    refresh().then(() => {
      prewarmActiveGames();
    });
    
    // Load Reddit index in background
    (async () => {
      try {
        await nbaService.getRedditIndex();
      } catch (error) {
        console.error('Failed to load Reddit index:', error);
      }
    })();
  });

  function prewarmActiveGames() {
    events.forEach(e => {
      const status = e?.competitions?.[0]?.status?.type?.name;
      if (status === 'STATUS_IN_PROGRESS' || status === 'STATUS_HALFTIME') {
        prewarmRedditData(e);
      }
    });
  }
  onDestroy(() => {
    if (interval) clearInterval(interval);
  });

  function formatLocalTime(dateStr: string) {
    try {
      const date = new Date(dateStr);
      const timeStr = date.toLocaleTimeString(undefined, { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false
      });
      
      // Get timezone abbreviation (e.g., AEST)
      const tzStr = date.toLocaleTimeString('en-AU', { timeZoneName: 'short' }).split(' ').pop();
      
      return `${timeStr} ${tzStr}`;
    } catch {
      return '';
    }
  }
  let hideScores = false;
  function toggleHide() {
    hideScores = !hideScores;
    try {
      localStorage.setItem('arrnba.hideScores', hideScores ? '1' : '0');
    } catch {}
  }

  function hideBrokenImage(event: Event) {
    const img = event.currentTarget as HTMLImageElement | null;
    if (img) img.style.display = 'none';
  }
</script>

<div bind:this={scoreboardContainer} class="p-4 min-h-screen swipe-area" style="touch-action: pan-y;">
  <div class="flex items-center justify-between mb-4">
    <h1 class="text-2xl font-semibold">ARR NBA</h1>
    <div class="flex items-center gap-2">
      <div class="flex items-center bg-white/5 border border-white/10 rounded overflow-hidden">
        <button class="px-3 py-1 hover:bg-white/10 border-r border-white/10" on:click={() => changeDate(-1)}>←</button>
        <span class="px-4 py-1 text-sm font-medium min-w-[200px] text-center">{formatDateDisplay(selectedDate)}</span>
        <button class="px-3 py-1 hover:bg-white/10 border-l border-white/10" on:click={() => changeDate(1)}>→</button>
      </div>
      <button class="px-3 py-1 rounded border border-white/10 bg-white/10 text-white/90"
        on:click={toggleHide}>
        {hideScores ? 'Show Scores' : 'Hide Scores'}
      </button>
    </div>
  </div>
  {#if !events || events.length === 0}
    <div class="text-white/70">No games found…</div>
  {:else}
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {#each events as e}
        <a href={`/game/${e.id}`} 
           on:mouseenter={() => { prewarmRedditData(e); nbaService.getBoxscore(e.id).catch(() => {}); }}
           on:touchstart={() => { prewarmRedditData(e); nbaService.getBoxscore(e.id).catch(() => {}); }}
           class="block border border-white/10 rounded p-3 hover:border-white/20">
          <div class="grid grid-cols-[auto_1fr_auto_1fr_auto] gap-x-2 items-center">
            <!-- Away Logo -->
            <div class="row-span-2 justify-self-center">
              <img
                src={`/logos/${getTeamLogoAbbr(e?.competitions?.[0]?.competitors?.find((c)=>c.homeAway==='away')?.team)}.svg`}
                alt="away"
                width="48" height="48" loading="lazy" decoding="async"
                on:error={hideBrokenImage}
              />
            </div>

            <!-- Away Abbr -->
            <div class="text-center font-medium">
              {getTeamLogoAbbr(e?.competitions?.[0]?.competitors?.find((c)=>c.homeAway==='away')?.team)}
            </div>

            <!-- Separator -->
            <div class="text-center text-white/70 font-medium">@</div>

            <!-- Home Abbr -->
            <div class="text-center font-medium">
              {getTeamLogoAbbr(e?.competitions?.[0]?.competitors?.find((c)=>c.homeAway==='home')?.team)}
            </div>

            <!-- Home Logo -->
            <div class="row-span-2 justify-self-center">
              <img
                src={`/logos/${getTeamLogoAbbr(e?.competitions?.[0]?.competitors?.find((c)=>c.homeAway==='home')?.team)}.svg`}
                alt="home"
                width="48" height="48" loading="lazy" decoding="async"
                on:error={hideBrokenImage}
              />
            </div>

            <!-- Away Score -->
            <div class="text-center">
              { (e?.competitions?.[0]?.status?.type?.name === 'STATUS_SCHEDULED' || hideScores) 
                ? '-' 
                : (e?.competitions?.[0]?.competitors?.find((c)=>c.homeAway==='away')?.score ?? 0) 
              }
            </div>

            <!-- Status / Time -->
            <div class="text-center text-white/70 whitespace-nowrap">
              {#if e?.competitions?.[0]?.status?.type?.name === 'STATUS_SCHEDULED'}
                {formatLocalTime(e.date)}
              {:else}
                {e?.competitions?.[0]?.status?.type?.shortDetail}
              {/if}
            </div>

            <!-- Home Score -->
            <div class="text-center">
              { (e?.competitions?.[0]?.status?.type?.name === 'STATUS_SCHEDULED' || hideScores) 
                ? '-' 
                : (e?.competitions?.[0]?.competitors?.find((c)=>c.homeAway==='home')?.score ?? 0) 
              }
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
