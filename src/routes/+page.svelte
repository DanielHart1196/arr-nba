<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
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

  const DAY_RANGE_PAST = 180;
  const DAY_RANGE_FUTURE = 140;
  const TOTAL_DAYS = DAY_RANGE_PAST + DAY_RANGE_FUTURE + 1;
  const START_INDEX = DAY_RANGE_PAST;
  const DAY_MS = 24 * 60 * 60 * 1000;
  const SNAP_THRESHOLD_RATIO = 0.28;
  const SWIPE_ANIM_MS = 120;

  const SCHEDULE_PREFETCH_KEY = 'arrnba.schedulePrefetch.v2';
  const PREFETCH_PAST_DAYS = DAY_RANGE_PAST;
  const PREFETCH_FUTURE_DAYS = DAY_RANGE_FUTURE;

  const baseDate = new Date();
  baseDate.setHours(0, 0, 0, 0);

  const dayOffsets = Array.from({ length: TOTAL_DAYS }, (_, i) => i - START_INDEX);
  const SAVED_DATE_KEY = 'arrnba.selectedDateKey';
  const LAST_DAY_EVENTS_KEY = 'arrnba.lastDayEvents.v1';

  function getInitialIndexFromSession(): number {
    if (typeof window === 'undefined') return START_INDEX;
    try {
      const raw = sessionStorage.getItem(SAVED_DATE_KEY);
      if (!raw) return START_INDEX;
      const parsed = parseLocalDateKey(raw);
      if (!parsed) return START_INDEX;
      return clampIndex(START_INDEX + dayDiffFromBase(parsed));
    } catch {
      return START_INDEX;
    }
  }

  const initialIndex = getInitialIndexFromSession();
  let currentIndex = initialIndex;
  let selectedDate = getDateForIndex(initialIndex);
  let cardsViewportWidth = 0;
  let dragOffsetPx = 0;
  let isDragging = false;
  let trackAnimating = false;
  let trackAnimationTimer: ReturnType<typeof setTimeout> | null = null;
  let suppressInitialTrackAnimation = true;
  let suppressTrackTransition = false;
  let hideScores = false;
  let interval: any;
  let prewarmTimeout: any;
  let lastNavAt = 0;
  let lastToggleAt = 0;
  let lastOpenAt = 0;
  let datePickerInput: HTMLInputElement | null = null;
  let dayIndexLinkByIndex: Record<number, string | null> = {};
  let dayIndexLoading = new Set<number>();

  function getInitialEventsFromSession(index: number): NBAEvent[] | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = sessionStorage.getItem(LAST_DAY_EVENTS_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { index?: number; dateKey?: string; events?: NBAEvent[] };
      if (parsed.index !== index) return null;
      if (!Array.isArray(parsed.events)) return null;
      const expectedDateKey = toLocalDateKey(getDateForIndex(index));
      if (parsed.dateKey !== expectedDateKey) return null;
      return parsed.events;
    } catch {
      return null;
    }
  }

  function readCachedScoreboardEvents(date: Date): NBAEvent[] | null {
    if (typeof window === 'undefined') return null;
    try {
      const key = `arrnba:scoreboard:${toScoreboardDateKey(date)}`;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { data?: { events?: NBAEvent[] } };
      return Array.isArray(parsed?.data?.events) ? parsed.data.events : null;
    } catch {
      return null;
    }
  }

  function getMergedCachedEventsForDate(date: Date): NBAEvent[] | null {
    const targetDateStr = date.toDateString();
    const fromPrev = readCachedScoreboardEvents(addDays(date, -1)) ?? [];
    const fromCurrent = readCachedScoreboardEvents(date) ?? [];
    const fromNext = readCachedScoreboardEvents(addDays(date, 1)) ?? [];
    if (fromPrev.length === 0 && fromCurrent.length === 0 && fromNext.length === 0) return null;
    return mergeUniqueAndSortEvents(
      [...fromPrev, ...fromCurrent, ...fromNext].filter((event) => isEventOnDate(event, targetDateStr))
    );
  }

  function hydrateAllDaysFromBrowserCache(seed: Record<number, NBAEvent[]>): Record<number, NBAEvent[]> {
    if (typeof window === 'undefined') return seed;
    const next: Record<number, NBAEvent[]> = { ...seed };
    for (let i = 0; i < TOTAL_DAYS; i++) {
      if (next[i]) continue;
      const merged = getMergedCachedEventsForDate(getDateForIndex(i));
      if (merged) next[i] = merged;
    }
    return next;
  }

  function saveDayEventsForIndex(index: number, events: NBAEvent[]) {
    if (typeof window === 'undefined') return;
    try {
      sessionStorage.setItem(
        LAST_DAY_EVENTS_KEY,
        JSON.stringify({
          index,
          dateKey: toLocalDateKey(getDateForIndex(index)),
          events
        })
      );
    } catch {}
  }

  const restoredInitialEvents = getInitialEventsFromSession(initialIndex);
  const initialSeedEvents: Record<number, NBAEvent[]> = restoredInitialEvents
    ? { [initialIndex]: restoredInitialEvents }
    : (initialIndex === START_INDEX ? { [initialIndex]: data.events ?? [] } : {});
  let dayEvents: Record<number, NBAEvent[]> = hydrateAllDaysFromBrowserCache(initialSeedEvents);
  let dayLoading = new Set<number>();

  const redditPrewarmed = new Set<string>();
  const boxscorePrewarmed = new Set<string>();

  function clampIndex(index: number): number {
    return Math.max(0, Math.min(TOTAL_DAYS - 1, index));
  }

  function getDateForIndex(index: number): Date {
    return addDays(baseDate, dayOffsets[index] ?? 0);
  }

  function setCurrentIndex(index: number): void {
    currentIndex = clampIndex(index);
    selectedDate = getDateForIndex(currentIndex);
  }

  function toLocalDateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function parseLocalDateKey(key: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    const out = new Date(y, mo, d);
    out.setHours(0, 0, 0, 0);
    return Number.isNaN(out.getTime()) ? null : out;
  }

  function dayDiffFromBase(date: Date): number {
    const a = Date.UTC(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
    const b = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    return Math.round((b - a) / DAY_MS);
  }

  function hasSameEventOrder(a: NBAEvent[], b: NBAEvent[]) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (a[i]?.id !== b[i]?.id) return false;
    }
    return true;
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

  async function loadDay(index: number, force = false): Promise<void> {
    const safeIndex = clampIndex(index);
    if (dayLoading.has(safeIndex)) return;
    if (!force && dayEvents[safeIndex]) return;

    dayLoading.add(safeIndex);
    dayLoading = new Set(dayLoading);
    try {
      const date = getDateForIndex(safeIndex);
      const merged = await fetchMergedEventsForDate(date);
      dayEvents[safeIndex] = merged;
      saveDayEventsForIndex(safeIndex, merged);

      if (safeIndex === currentIndex) {
        prewarmBoxscores(merged);
        prewarmActiveGames(merged);
      }
    } catch (error) {
      console.error(`Failed to load day index ${safeIndex}:`, error);
    } finally {
      dayLoading.delete(safeIndex);
      dayLoading = new Set(dayLoading);
    }
  }

  function prefetchAround(index: number) {
    loadDay(index).catch(() => {});
    loadDay(index - 1).catch(() => {});
    loadDay(index + 1).catch(() => {});
    loadDailyIndexLink(index).catch(() => {});
    loadDailyIndexLink(index - 1).catch(() => {});
    loadDailyIndexLink(index + 1).catch(() => {});
  }

  function buildPrefetchDateKeys(anchor: Date) {
    const keys: string[] = [];
    for (let i = -PREFETCH_PAST_DAYS; i <= PREFETCH_FUTURE_DAYS; i++) {
      keys.push(toScoreboardDateKey(addDays(anchor, i)));
    }
    return keys;
  }

  async function prefetchScheduleWindow() {
    try {
      if (typeof localStorage === 'undefined') return;
      if (localStorage.getItem(SCHEDULE_PREFETCH_KEY) === '1') return;
      const keys = buildPrefetchDateKeys(selectedDate);
      await nbaService.prewarmScoreboards(keys);
      localStorage.setItem(SCHEDULE_PREFETCH_KEY, '1');
    } catch (error) {
      console.warn('Failed to prefetch schedule window:', error);
    }
  }

  function saveSelectedDateForIndex(index: number) {
    try {
      const date = getDateForIndex(index);
      sessionStorage.setItem(SAVED_DATE_KEY, toLocalDateKey(date));
    } catch {}
  }

  function snapToIndex(index: number) {
    const nextIndex = clampIndex(index);
    if (nextIndex === currentIndex) {
      isDragging = false;
      dragOffsetPx = 0;
      return;
    }

    // Allow new navigation to interrupt the previous animation window.
    if (trackAnimationTimer) {
      clearTimeout(trackAnimationTimer);
      trackAnimationTimer = null;
    }

    trackAnimating = true;
    isDragging = false;
    setCurrentIndex(nextIndex);
    dragOffsetPx = 0;
    saveSelectedDateForIndex(nextIndex);
    if (dayEvents[nextIndex]) {
      saveDayEventsForIndex(nextIndex, dayEvents[nextIndex]);
    }
    prefetchAround(nextIndex);

    trackAnimationTimer = setTimeout(() => {
      trackAnimating = false;
      trackAnimationTimer = null;
    }, SWIPE_ANIM_MS);
  }

  function changeDate(delta: number) {
    if (delta !== 1 && delta !== -1) return;
    snapToIndex(currentIndex + delta);
  }

  function cancelTrackAnimationForTap() {
    if (!trackAnimating) return;
    if (trackAnimationTimer) {
      clearTimeout(trackAnimationTimer);
      trackAnimationTimer = null;
    }
    trackAnimating = false;
    suppressTrackTransition = true;
    dragOffsetPx = 0;
    requestAnimationFrame(() => {
      suppressTrackTransition = false;
    });
  }

  function requestDateDelta(delta: number) {
    const now = Date.now();
    // Avoid duplicate click+pointer/touch firing for one gesture.
    if (now - lastNavAt < 90) return;
    lastNavAt = now;
    changeDate(delta);
  }

  function openDatePicker() {
    const input = datePickerInput;
    if (!input) return;
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    if (pickerInput.showPicker) {
      pickerInput.showPicker();
      return;
    }
    input.click();
  }

  function handleDatePicked(value: string) {
    const picked = parseLocalDateKey(value);
    if (!picked) return;
    const nextIndex = clampIndex(START_INDEX + dayDiffFromBase(picked));
    snapToIndex(nextIndex);
  }

  function interactionLocked(): boolean {
    return trackAnimating || isDragging || Math.abs(dragOffsetPx) > 4;
  }

  function requestToggleHide() {
    if (interactionLocked()) return;
    const now = Date.now();
    if (now - lastToggleAt < 90) return;
    lastToggleAt = now;
    toggleHide();
  }

  function openGame(gameId: string) {
    if (interactionLocked()) return;
    const now = Date.now();
    if (now - lastOpenAt < 120) return;
    lastOpenAt = now;
    goto(`/game/${gameId}`);
  }

  function handleSwipeDrag(deltaX: number) {
    if (trackAnimating) return;
    const width = Math.max(cardsViewportWidth, 320);
    const clamped = Math.max(-width * 0.9, Math.min(width * 0.9, deltaX));
    isDragging = true;
    dragOffsetPx = clamped;
  }

  function handleGestureEnd(didSwipe: boolean) {
    if (trackAnimating) return;
    if (didSwipe) return;

    const width = Math.max(cardsViewportWidth, 320);
    const threshold = width * SNAP_THRESHOLD_RATIO;
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

  function formatDateDisplay(date: Date) {
    return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  }

  async function loadDailyIndexLink(index: number): Promise<void> {
    const safeIndex = clampIndex(index);
    if (dayIndexLinkByIndex[safeIndex] !== undefined) return;
    if (dayIndexLoading.has(safeIndex)) return;

    dayIndexLoading.add(safeIndex);
    dayIndexLoading = new Set(dayIndexLoading);
    try {
      const date = getDateForIndex(safeIndex);
      const post = await nbaService.getDailyIndexPostForDate(toLocalDateKey(date));
      dayIndexLinkByIndex[safeIndex] = post?.url || (post?.permalink ? `https://www.reddit.com${post.permalink}` : null);
    } catch {
      dayIndexLinkByIndex[safeIndex] = null;
    } finally {
      dayIndexLoading.delete(safeIndex);
      dayIndexLoading = new Set(dayIndexLoading);
    }
  }

  async function prewarmRedditData(event: NBAEvent, force = false) {
    const eventId = event?.id;
    if (!eventId) return;
    if (!force && redditPrewarmed.has(eventId)) return;

    if (prewarmTimeout) clearTimeout(prewarmTimeout);

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
    }, 150);
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

  function prewarmActiveGames(eventList: NBAEvent[]) {
    eventList.forEach((e) => {
      const status = e?.competitions?.[0]?.status?.type?.name;
      if (status === 'STATUS_IN_PROGRESS' || status === 'STATUS_HALFTIME') {
        prewarmRedditData(e);
      }
    });
  }

  function formatLocalTime(dateStr: string) {
    try {
      const date = new Date(dateStr);
      const timeStr = date.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });

      const tzStr = date.toLocaleTimeString('en-AU', { timeZoneName: 'short' }).split(' ').pop();
      return `${timeStr} ${tzStr}`;
    } catch {
      return '';
    }
  }

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

  function cardsForIndex(index: number): GameCardView[] {
    const list = dayEvents[index] ?? [];
    return list.map((event) => toGameCard(event, hideScores));
  }

  let scoreboardContainer: HTMLElement;
  onMount(() => {
    try {
      const v = localStorage.getItem('arrnba.hideScores');
      hideScores = v === '1';
    } catch {}

    prefetchAround(currentIndex);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        suppressInitialTrackAnimation = false;
      });
    });
    prefetchScheduleWindow().catch(() => {});

    interval = setInterval(() => {
      loadDay(currentIndex, true).catch(() => {});
    }, 15000);

    createTouchGestures({
      target: scoreboardContainer,
      onSwipeRight: () => snapToIndex(currentIndex - 1),
      onSwipeLeft: () => snapToIndex(currentIndex + 1),
      onHorizontalDrag: handleSwipeDrag,
      onGestureEnd: handleGestureEnd,
      threshold: 50
    });

    (async () => {
      try {
        await nbaService.getRedditIndex();
      } catch (error) {
        console.error('Failed to load Reddit index:', error);
      }
    })();
  });

  onDestroy(() => {
    if (interval) clearInterval(interval);
    if (prewarmTimeout) clearTimeout(prewarmTimeout);
    if (trackAnimationTimer) clearTimeout(trackAnimationTimer);
  });
</script>

<div bind:this={scoreboardContainer} class="p-4 min-h-screen swipe-area" style="touch-action: pan-y;" role="presentation" on:touchstart={cancelTrackAnimationForTap}>
  <div class="grid grid-cols-[1fr_auto_1fr] items-end mb-4" data-no-swipe="true">
    <div></div>
    <div class="justify-self-center" data-no-swipe="true">
      <div class="flex items-center bg-white/5 border border-white/10 rounded overflow-hidden">
        <button data-no-swipe="true" class="px-2.5 py-1 hover:bg-white/10 border-r border-white/10" on:pointerup={() => requestDateDelta(-1)} on:click={() => requestDateDelta(-1)}>&lt;</button>
        <button
          data-no-swipe="true"
          type="button"
          class="px-3 py-1 text-sm font-medium min-w-[140px] text-center hover:bg-white/10"
          on:pointerup={openDatePicker}
          on:click|preventDefault={openDatePicker}
        >
          {formatDateDisplay(selectedDate)}
        </button>
        <input
          bind:this={datePickerInput}
          type="date"
          class="sr-only"
          value={toLocalDateKey(selectedDate)}
          min={toLocalDateKey(getDateForIndex(0))}
          max={toLocalDateKey(getDateForIndex(TOTAL_DAYS - 1))}
          on:change={(e) => handleDatePicked((e.currentTarget as HTMLInputElement).value)}
        />
        <button data-no-swipe="true" class="px-2.5 py-1 hover:bg-white/10 border-l border-white/10" on:pointerup={() => requestDateDelta(1)} on:click={() => requestDateDelta(1)}>&gt;</button>
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
          style="touch-action: manipulation;"
          on:pointerup={requestToggleHide}
          on:click|preventDefault={requestToggleHide}
        >
          <span
            class="pointer-events-none absolute left-[2px] top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-white transition-transform duration-200 {hideScores ? '' : 'translate-x-5'}"
          ></span>
        </button>
      </div>
    </div>
  </div>

  <div class="relative overflow-hidden" bind:clientWidth={cardsViewportWidth}>
    <div
      class="flex"
      style="width: {(cardsViewportWidth || 1) * TOTAL_DAYS}px; transform: translate3d({(-currentIndex * (cardsViewportWidth || 1)) + dragOffsetPx}px, 0, 0); transition: {(isDragging || suppressInitialTrackAnimation || suppressTrackTransition) ? 'none' : `transform ${SWIPE_ANIM_MS}ms ease-out`};"
    >
      {#each dayOffsets as _offset, i}
        <div class="shrink-0 px-0.5" style="width: {cardsViewportWidth || 1}px;">
          {#if dayLoading.has(i) && !dayEvents[i]}
            <div class="text-white/70">Loading games...</div>
          {:else if !dayEvents[i] || dayEvents[i].length === 0}
            <div class="text-white/70">No games found...</div>
          {:else}
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {#each cardsForIndex(i) as game (game.id)}
                <a href={`/game/${game.id}`} on:mouseenter={() => prewarmGameData(game)} on:touchstart={() => prewarmGameData(game)} on:pointerup={() => openGame(game.id)} on:click|preventDefault={() => openGame(game.id)} class="block border border-white/10 rounded p-3 hover:border-white/20" style="touch-action: manipulation;">
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
              {/each}
            </div>
          {/if}
          <div class="mt-3 text-center" data-no-swipe="true">
            {#if dayIndexLinkByIndex[i]}
              <a
                href={dayIndexLinkByIndex[i] ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                class="text-xs text-pink-300 hover:text-pink-200 underline"
              >
                Open Daily Thread + Game Thread Index
              </a>
            {:else if dayIndexLoading.has(i)}
              <span class="text-xs text-white/60">Finding Daily Thread...</span>
            {:else}
              <button
                class="text-xs text-pink-300 hover:text-pink-200 underline"
                on:click={() => loadDailyIndexLink(i)}
                type="button"
              >
                Load Daily Thread Link
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>
</div>
