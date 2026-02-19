<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { nbaService } from '../lib/services/nba.service';
  import { prewarmRedditForMatch } from '../lib/services/reddit-prewarm.service';
  import { getTeamLogoAbbr } from '../lib/utils/team.utils';
  import { addDays, getEventTeamDisplayNames, isEventOnDate, mergeUniqueAndSortEvents, toScoreboardDateKey } from '../lib/utils/scoreboard.utils';
  import { createTouchGestures } from '../lib/composables/touch-gestures';
  import type { Event as NBAEvent } from '../lib/types/nba';
  
  type GameCardView = {
    id: string;
    event: NBAEvent;
    awayAbbr: string;
    homeAbbr: string;
    awayScore: string | number;
    homeScore: string | number;
    statusText: string;
    awayLogo: string;
    homeLogo: string;
    scheduled: boolean;
  };

  export let data: { events: NBAEvent[] };
  let events = data.events ?? [];
  let prevEvents: NBAEvent[] = [];
  let nextEvents: NBAEvent[] = [];
  let interval: any;
  let refreshInFlight = false;
  let selectedDate = new Date();
  let gameCards: GameCardView[] = [];
  let prevCards: GameCardView[] = [];
  let nextCards: GameCardView[] = [];
  const redditPrewarmed = new Set<string>();
  const boxscorePrewarmed = new Set<string>();
  let cardsViewportWidth = 0;
  let trackOffsetPx = 0;
  let trackAnimating = false;
  let swipeDirection: -1 | 0 | 1 = 0;
  let isSwipeDragging = false;
  let adjacentRequestSeq = 0;

  function hasSameEventOrder(a: NBAEvent[], b: NBAEvent[]) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i]?.id !== b[i]?.id) return false;
    }
    return true;
  }

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
        const cachedMatches = (cached.events ?? []).filter(isOnTargetDay);
        // If we have any data cached for today, show it immediately while background fetch completes the 3-day window
        if (cachedMatches.length > 0 && !hasSameEventOrder(events, cachedMatches)) {
          events = cachedMatches;
        }
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
      const merged = mergeUniqueAndSortEvents(allMatches);
      if (!hasSameEventOrder(events, merged)) {
        events = merged;
      }
      prewarmBoxscores(events);
      
      // Pre-warm the adjacent days in the background to make next swipes instant
      const dayAfter = addDays(selectedDate, 2); // We already fetched selectedDate + 1
      const dayBefore = addDays(selectedDate, -2); // We already fetched selectedDate - 1
      
      nbaService.getScoreboard(toScoreboardDateKey(dayAfter)).catch(() => {});
      nbaService.getScoreboard(toScoreboardDateKey(dayBefore)).catch(() => {});
      preloadAdjacentDays(currentDay).catch(() => {});

    } catch (error) {
      console.error('Failed to refresh scoreboard:', error);
    } finally {
      refreshInFlight = false;
    }
  }

  function changeDate(delta: number) {
    if (delta === 1) commitSwipe(1);
    else if (delta === -1) commitSwipe(-1);
  }

  async function fetchMergedEventsForDate(date: Date): Promise<NBAEvent[]> {
    const targetDateStr = date.toDateString();
    const prevDay = addDays(date, -1);
    const nextDay = addDays(date, 1);
    const isOnTargetDay = (event: NBAEvent) => isEventOnDate(event, targetDateStr);

    const [response, prevResponse, nextResponse] = await Promise.all([
      nbaService.getScoreboard(toScoreboardDateKey(date)),
      nbaService.getScoreboard(toScoreboardDateKey(prevDay)),
      nbaService.getScoreboard(toScoreboardDateKey(nextDay))
    ]);

    const fromCurrent = (response.events ?? []).filter(isOnTargetDay);
    const fromPrev = (prevResponse.events ?? []).filter(isOnTargetDay);
    const fromNext = (nextResponse.events ?? []).filter(isOnTargetDay);
    return mergeUniqueAndSortEvents([...fromPrev, ...fromCurrent, ...fromNext]);
  }

  async function preloadAdjacentDays(baseDate: Date) {
    const req = ++adjacentRequestSeq;
    const prevDate = addDays(baseDate, -1);
    const nextDate = addDays(baseDate, 1);

    try {
      const [prevMerged, nextMerged] = await Promise.all([
        fetchMergedEventsForDate(prevDate),
        fetchMergedEventsForDate(nextDate)
      ]);
      if (req !== adjacentRequestSeq) return;

      prevEvents = prevMerged;
      nextEvents = nextMerged;
      prevCards = prevMerged.map((event) => toGameCard(event, hideScores));
      nextCards = nextMerged.map((event) => toGameCard(event, hideScores));
    } catch (error) {
      if (req !== adjacentRequestSeq) return;
      console.error('Failed to preload adjacent swipe days:', error);
    }
  }

  function handleSwipeDrag(deltaX: number) {
    if (trackAnimating) return;
    const width = Math.max(cardsViewportWidth, 320);
    const clamped = Math.max(-width * 0.9, Math.min(width * 0.9, deltaX));
    swipeDirection = clamped < 0 ? 1 : -1;
    isSwipeDragging = true;
    trackOffsetPx = clamped;
  }

  function resetSwipePreview() {
    if (trackAnimating) return;
    isSwipeDragging = false;
    trackOffsetPx = 0;
    swipeDirection = 0;
  }

  function finalizeSwipeState() {
    trackAnimating = false;
    isSwipeDragging = false;
    trackOffsetPx = 0;
    swipeDirection = 0;
  }

  function commitSwipe(direction: -1 | 1) {
    if (trackAnimating) return;
    const width = Math.max(cardsViewportWidth, 320);
    trackAnimating = true;
    isSwipeDragging = false;
    swipeDirection = direction;
    trackOffsetPx = direction === 1 ? -width : width;

    setTimeout(() => {
      selectedDate = addDays(selectedDate, direction);
      if (direction === 1) {
        events = nextEvents;
        gameCards = nextCards;
      } else {
        events = prevEvents;
        gameCards = prevCards;
      }
      // Snap back to center with transitions disabled to avoid opposite-side flip.
      isSwipeDragging = true;
      trackOffsetPx = 0;
      requestAnimationFrame(() => {
        trackAnimating = false;
        isSwipeDragging = false;
        swipeDirection = 0;
      });
      preloadAdjacentDays(selectedDate).catch(() => {});
      refresh().catch(() => {});
    }, 180);
  }

  function formatDateDisplay(date: Date) {
    return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  }
  
  // Preload Reddit data when user hovers or taps on a game
  let prewarmTimeout: any;
  async function prewarmRedditData(event: NBAEvent, force = false) {
    const eventId = event?.id;
    if (!eventId) return;
    if (!force && redditPrewarmed.has(eventId)) return;

    // Clear any pending prewarm to avoid spamming during swipes
    if (prewarmTimeout) clearTimeout(prewarmTimeout);
    
    // Delay pre-warming slightly. If it's a swipe, this will be cancelled or ignored.
    prewarmTimeout = setTimeout(async () => {
      const teams = getEventTeamDisplayNames(event);
      if (!teams) return;
      const { awayName, homeName } = teams;
      
      try {
        redditPrewarmed.add(eventId);
        await prewarmRedditForMatch(nbaService, awayName, homeName);
      } catch (error) {
        redditPrewarmed.delete(eventId);
        console.error(`Failed to preload Reddit data for ${awayName} vs ${homeName}:`, error);
      }
    }, 150); // 150ms delay to differentiate tap/hover from swipe
  }

  async function prewarmBoxscores(eventList: NBAEvent[]) {
    try {
      const ids = eventList
        .map((e) => e.id)
        .filter((id): id is string => Boolean(id))
        .filter((id) => !boxscorePrewarmed.has(id));
      if (ids.length === 0) return;
      ids.forEach((id) => boxscorePrewarmed.add(id));
      nbaService.prewarmBoxscores(ids).catch(() => {});
    } catch (error) {
      console.error('Failed to prewarm boxscores:', error);
    }
  }

  function prewarmGameData(game: GameCardView) {
    prewarmRedditData(game.event);
    if (!boxscorePrewarmed.has(game.id)) {
      boxscorePrewarmed.add(game.id);
      nbaService.getBoxscore(game.id).catch(() => {
        boxscorePrewarmed.delete(game.id);
      });
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
      onSwipeRight: () => commitSwipe(-1),
      onSwipeLeft: () => commitSwipe(1),
      onHorizontalDrag: handleSwipeDrag,
      onGestureEnd: (didSwipe) => {
        if (!didSwipe) resetSwipePreview();
      },
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
    if (prewarmTimeout) clearTimeout(prewarmTimeout);
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
    gameCards = events.map((event) => toGameCard(event, hideScores));
    prevCards = prevEvents.map((event) => toGameCard(event, hideScores));
    nextCards = nextEvents.map((event) => toGameCard(event, hideScores));
    try {
      localStorage.setItem('arrnba.hideScores', hideScores ? '1' : '0');
    } catch {}
  }

  function hideBrokenImage(event: Event) {
    const img = event.currentTarget as HTMLImageElement | null;
    if (img) img.style.display = 'none';
  }

  function getCompetitor(event: NBAEvent, side: 'home' | 'away') {
    return event?.competitions?.[0]?.competitors?.find((c) => c.homeAway === side);
  }

  function toGameCard(event: NBAEvent, scoresHidden: boolean): GameCardView {
    const away = getCompetitor(event, 'away');
    const home = getCompetitor(event, 'home');
    const statusName = event?.competitions?.[0]?.status?.type?.name ?? '';
    const scheduled = statusName === 'STATUS_SCHEDULED';

    const awayAbbr = getTeamLogoAbbr(away?.team);
    const homeAbbr = getTeamLogoAbbr(home?.team);

    return {
      id: event.id,
      event,
      awayAbbr,
      homeAbbr,
      awayLogo: `/logos/${awayAbbr}.svg`,
      homeLogo: `/logos/${homeAbbr}.svg`,
      awayScore: (scheduled || scoresHidden) ? '-' : (away?.score ?? 0),
      homeScore: (scheduled || scoresHidden) ? '-' : (home?.score ?? 0),
      statusText: scheduled ? formatLocalTime(event.date) : (event?.competitions?.[0]?.status?.type?.shortDetail ?? ''),
      scheduled
    };
  }

  $: gameCards = events.map((event) => toGameCard(event, hideScores));
</script>

<div bind:this={scoreboardContainer} class="p-4 min-h-screen swipe-area" style="touch-action: pan-y;">
  <div class="grid grid-cols-[1fr_auto_1fr] items-end mb-4" data-no-swipe="true">
    <div></div>
    <div class="justify-self-center" data-no-swipe="true">
      <div class="flex items-center bg-white/5 border border-white/10 rounded overflow-hidden">
        <button data-no-swipe="true" class="px-2.5 py-1 hover:bg-white/10 border-r border-white/10" on:click={() => changeDate(-1)}>&lt;</button>
        <span class="px-3 py-1 text-sm font-medium min-w-[140px] text-center">{formatDateDisplay(selectedDate)}</span>
        <button data-no-swipe="true" class="px-2.5 py-1 hover:bg-white/10 border-l border-white/10" on:click={() => changeDate(1)}>&gt;</button>
      </div>
    </div>
    <div class="justify-self-end" data-no-swipe="true">
      <div class="flex flex-col items-center gap-1 select-none">
        <span class="text-[11px] text-white/70 leading-none">Scores</span>
        <button
          data-no-swipe="true"
          type="button"
          role="switch"
          aria-label="Toggle scores visibility"
          aria-checked={!hideScores}
          class="relative h-5 w-10 rounded-full border border-white/15 transition-colors {hideScores ? 'bg-white/10' : 'bg-[#4b5563]'}"
          on:click={toggleHide}
        >
          <span
            class="pointer-events-none absolute left-[2px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white transition-transform duration-200 {hideScores ? '' : 'translate-x-5'}"
          ></span>
        </button>
      </div>
    </div>
  </div>
  {#if !events || events.length === 0}
    <div class="text-white/70">No games found...</div>
  {:else}
    <div class="relative overflow-hidden" bind:clientWidth={cardsViewportWidth}>
      <div
        class="flex w-[300%]"
        style="transform: translate3d(calc(-33.333333% + {trackOffsetPx}px), 0, 0); transition: {isSwipeDragging ? 'none' : 'transform 180ms ease-out'};"
      >
        {#each [prevCards, gameCards, nextCards] as paneCards, paneIndex}
          <div class="w-1/3 shrink-0 px-0.5">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {#if paneCards.length === 0}
                <div class="text-white/70">No games found...</div>
              {:else}
                {#each paneCards as game (game.id)}
                  {#if paneIndex === 1}
                    <a href={`/game/${game.id}`} on:mouseenter={() => prewarmGameData(game)} on:touchstart={() => prewarmGameData(game)} class="block border border-white/10 rounded p-3 hover:border-white/20">
                      <div class="grid grid-cols-[auto_1fr_auto_1fr_auto] gap-x-2 items-center">
                        <div class="row-span-2 justify-self-center"><img src={game.awayLogo} alt="away" width="48" height="48" loading="lazy" decoding="async" on:error={hideBrokenImage} /></div>
                        <div class="text-center font-medium">{game.awayAbbr}</div>
                        <div class="text-center text-white/70 font-medium">@</div>
                        <div class="text-center font-medium">{game.homeAbbr}</div>
                        <div class="row-span-2 justify-self-center"><img src={game.homeLogo} alt="home" width="48" height="48" loading="lazy" decoding="async" on:error={hideBrokenImage} /></div>
                        <div class="text-center">{game.awayScore}</div>
                        <div class="text-center text-white/70 whitespace-nowrap">{game.statusText}</div>
                        <div class="text-center">{game.homeScore}</div>
                      </div>
                    </a>
                  {:else}
                    <div class="block border border-white/10 rounded p-3">
                      <div class="grid grid-cols-[auto_1fr_auto_1fr_auto] gap-x-2 items-center">
                        <div class="row-span-2 justify-self-center"><img src={game.awayLogo} alt="away" width="48" height="48" loading="lazy" decoding="async" on:error={hideBrokenImage} /></div>
                        <div class="text-center font-medium">{game.awayAbbr}</div>
                        <div class="text-center text-white/70 font-medium">@</div>
                        <div class="text-center font-medium">{game.homeAbbr}</div>
                        <div class="row-span-2 justify-self-center"><img src={game.homeLogo} alt="home" width="48" height="48" loading="lazy" decoding="async" on:error={hideBrokenImage} /></div>
                        <div class="text-center">{game.awayScore}</div>
                        <div class="text-center text-white/70 whitespace-nowrap">{game.statusText}</div>
                        <div class="text-center">{game.homeScore}</div>
                      </div>
                    </div>
                  {/if}
                {/each}
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
