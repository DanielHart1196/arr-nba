<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { nbaService } from '../lib/services/nba.service';
  import { getTeamLogoAbbr, getTeamLogoPath, getTeamLogoScaleStyleByAbbr } from '../lib/utils/team.utils';
  import { addDays, mergeUniqueAndSortEvents, toScoreboardDateKey } from '../lib/utils/scoreboard.utils';
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
  const PREFETCH_PAST_DAYS = 2;
  const PREFETCH_FUTURE_DAYS = 2;
  const PREFETCH_CONCURRENCY = 1;
  const PREFETCH_CHUNK_PAUSE_MS = 120;
  const CACHE_HYDRATE_WINDOW_DAYS = 7;

  let baseDate = localStartOfToday();

  const dayOffsets = Array.from({ length: TOTAL_DAYS }, (_, i) => i - START_INDEX);
  const SAVED_DATE_KEY = 'arrnba.selectedDateKey';
  const LAST_DAY_EVENTS_KEY = 'arrnba.lastDayEvents.v1';

  function localStartOfToday(): Date {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now;
  }

  function getInitialIndexFromSession(): number {
    if (typeof window === 'undefined') return START_INDEX;
    try {
      const raw = sessionStorage.getItem(SAVED_DATE_KEY);
      if (!raw) return START_INDEX;

      const todayKey = toLocalDateKey(localStartOfToday());

      if (raw.startsWith('{')) {
        const parsed = JSON.parse(raw) as { selectedDateKey?: string; savedOnDateKey?: string };
        if (!parsed?.selectedDateKey || parsed.savedOnDateKey !== todayKey) return START_INDEX;
        const selectedDate = parseLocalDateKey(parsed.selectedDateKey);
        if (!selectedDate) return START_INDEX;
        return clampIndex(START_INDEX + dayDiffFromBase(selectedDate));
      }

      // Backward compatibility for older string-only payloads.
      const legacyDate = parseLocalDateKey(raw);
      if (!legacyDate) return START_INDEX;
      if (toLocalDateKey(legacyDate) !== todayKey) return START_INDEX;
      return clampIndex(START_INDEX + dayDiffFromBase(legacyDate));
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
  let loadRequestSeq = 0;
  const latestAppliedSeqByIndex = new Map<number, number>();
  let lastNavAt = 0;
  let lastToggleAt = 0;
  let lastOpenAt = 0;
  let lastPickerOpenAt = 0;
  let datePickerInput: HTMLInputElement | null = null;

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

  function readRawCachedScoreboardEvents(date: Date): NBAEvent[] | null {
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

  function readCachedScoreboardEvents(date: Date): NBAEvent[] | null {
    // Browser cache entries are stored by ESPN date buckets, not local calendar days.
    // Reconstruct local-day results from adjacent cached buckets so hydration matches runtime fetch logic.
    const targetLocalDateKey = toLocalDateKey(date);
    const buckets = [
      readRawCachedScoreboardEvents(addDays(date, -1)),
      readRawCachedScoreboardEvents(date),
      readRawCachedScoreboardEvents(addDays(date, 1))
    ];
    const foundBucket = buckets.some((bucket) => Array.isArray(bucket));
    if (!foundBucket) return null;

    const merged = mergeUniqueAndSortEvents(buckets.flatMap((bucket) => bucket ?? []));
    const filtered = merged.filter((event) => localDateKeyFromEventDate(event?.date) === targetLocalDateKey);

    // Do not hydrate empty arrays from partial/stale bucket cache; let loadDay fetch instead.
    if (filtered.length === 0) return null;
    return filtered;
  }

  function hydrateNearbyDaysFromBrowserCache(seed: Record<number, NBAEvent[]>, centerIndex: number): Record<number, NBAEvent[]> {
    if (typeof window === 'undefined') return seed;
    const next: Record<number, NBAEvent[]> = { ...seed };
    const start = clampIndex(centerIndex - CACHE_HYDRATE_WINDOW_DAYS);
    const end = clampIndex(centerIndex + CACHE_HYDRATE_WINDOW_DAYS);
    for (let i = start; i <= end; i++) {
      if (next[i]) continue;
      const cached = readCachedScoreboardEvents(getDateForIndex(i));
      if (cached && cached.length > 0) next[i] = cached;
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
  let dayEvents: Record<number, NBAEvent[]> = hydrateNearbyDaysFromBrowserCache(initialSeedEvents, initialIndex);
  let currentDisplayEvents: NBAEvent[] = dayEvents[initialIndex] ?? [];
  let dayLoading = new Set<number>();

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
    currentDisplayEvents = dayEvents[currentIndex] ?? [];
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

  function localDateKeyFromEventDate(dateStr: string | undefined): string | null {
    if (!dateStr) return null;
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return null;
    return toLocalDateKey(date);
  }

  function handleLocalDayRolloverIfNeeded() {
    const today = localStartOfToday();
    if (toLocalDateKey(today) === toLocalDateKey(baseDate)) return;

    const wasOnToday = currentIndex === START_INDEX;
    const previousSelectedDate = selectedDate;

    baseDate = today;

    const rebasedIndex = wasOnToday
      ? START_INDEX
      : clampIndex(START_INDEX + dayDiffFromBase(previousSelectedDate));

    setCurrentIndex(rebasedIndex);
    saveSelectedDateForIndex(rebasedIndex);
    loadDay(rebasedIndex, true).catch(() => {});
    loadDay(rebasedIndex - 1).catch(() => {});
    loadDay(rebasedIndex + 1).catch(() => {});
  }

  async function fetchEventsForDate(date: Date, forceRefresh = false): Promise<NBAEvent[]> {
    const targetLocalDateKey = toLocalDateKey(date);
    const buckets = await Promise.all([
      nbaService.getScoreboard(toScoreboardDateKey(addDays(date, -1)), forceRefresh),
      nbaService.getScoreboard(toScoreboardDateKey(date), forceRefresh),
      nbaService.getScoreboard(toScoreboardDateKey(addDays(date, 1)), forceRefresh)
    ]);
    const merged = mergeUniqueAndSortEvents(buckets.flatMap((b) => b.events ?? []));
    return merged.filter((event) => localDateKeyFromEventDate(event?.date) === targetLocalDateKey);
  }

  function isTodaySelected(): boolean {
    return toScoreboardDateKey(selectedDate) === toScoreboardDateKey(new Date());
  }

  async function loadDay(index: number, force = false): Promise<void> {
    const safeIndex = clampIndex(index);
    if (dayLoading.has(safeIndex)) return;
    if (!force && Array.isArray(dayEvents[safeIndex]) && dayEvents[safeIndex].length > 0) return;

    const requestSeq = ++loadRequestSeq;
    dayLoading.add(safeIndex);
    dayLoading = new Set(dayLoading);
    try {
      const date = getDateForIndex(safeIndex);
      const merged = await fetchEventsForDate(date, force);

      const lastApplied = latestAppliedSeqByIndex.get(safeIndex) ?? 0;
      if (requestSeq < lastApplied) return;
      latestAppliedSeqByIndex.set(safeIndex, requestSeq);

      dayEvents[safeIndex] = merged;
      dayEvents = { ...dayEvents };
      saveDayEventsForIndex(safeIndex, merged);
      if (safeIndex === currentIndex) {
        currentDisplayEvents = merged;
      }

      if (safeIndex === currentIndex) {
        prewarmBoxscores(merged);
      }
    } catch (error) {
      console.error(`Failed to load day index ${safeIndex}:`, error);
    } finally {
      dayLoading.delete(safeIndex);
      dayLoading = new Set(dayLoading);
    }
  }

  function prefetchNeighbor(index: number, direction: -1 | 1) {
    loadDay(index + direction).catch(() => {});
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

      // Run low-priority prefetch in small chunks so current-day loads stay responsive.
      for (let i = 0; i < keys.length; i += PREFETCH_CONCURRENCY) {
        const chunk = keys.slice(i, i + PREFETCH_CONCURRENCY);
        await nbaService.prewarmScoreboards(chunk);
        if (PREFETCH_CHUNK_PAUSE_MS > 0) {
          await new Promise((resolve) => setTimeout(resolve, PREFETCH_CHUNK_PAUSE_MS));
        }
      }
      localStorage.setItem(SCHEDULE_PREFETCH_KEY, '1');
    } catch (error) {
      console.warn('Failed to prefetch schedule window:', error);
    }
  }

  function saveSelectedDateForIndex(index: number) {
    try {
      const date = getDateForIndex(index);
      sessionStorage.setItem(
        SAVED_DATE_KEY,
        JSON.stringify({
          selectedDateKey: toLocalDateKey(date),
          savedOnDateKey: toLocalDateKey(localStartOfToday())
        })
      );
    } catch {}
  }

  function snapToIndex(index: number) {
    const nextIndex = clampIndex(index);
    const previousIndex = currentIndex;
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
    const hasCachedEvents = Array.isArray(dayEvents[nextIndex]) && dayEvents[nextIndex].length > 0;
    loadDay(nextIndex, !hasCachedEvents).catch(() => {});
    const direction: -1 | 1 = nextIndex > previousIndex ? 1 : -1;
    prefetchNeighbor(nextIndex, direction);

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
      try {
        pickerInput.showPicker();
        return;
      } catch {
        // Fallback for browsers that reject showPicker when user activation is lost.
      }
    }
    input.click();
  }

  function requestOpenDatePicker() {
    const now = Date.now();
    if (now - lastPickerOpenAt < 90) return;
    lastPickerOpenAt = now;
    openDatePicker();
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
    ensureBoxscorePrewarmById(gameId);
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

  function ensureBoxscorePrewarmById(gameId: string) {
    if (boxscorePrewarmed.has(gameId)) return;
    boxscorePrewarmed.add(gameId);
    nbaService.getBoxscore(gameId).catch(() => {
      boxscorePrewarmed.delete(gameId);
    });
  }

  function prewarmGameData(game: GameCardView) {
    ensureBoxscorePrewarmById(game.id);
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

  function toGameCard(event: NBAEvent): GameCardView {
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
      awayLogo: getTeamLogoPath(away?.team),
      homeLogo: getTeamLogoPath(home?.team),
      awayScore: away?.score ?? 0,
      homeScore: home?.score ?? 0,
      statusText: scheduled ? formatLocalTime(event.date) : (event?.competitions?.[0]?.status?.type?.shortDetail ?? ''),
      scheduled
    };
  }

  function cardsForEvents(list: NBAEvent[]): GameCardView[] {
    return list.map((event) => toGameCard(event));
  }

  function parseClockSeconds(clock: unknown): number | null {
    if (clock === null || clock === undefined) return null;
    const raw = String(clock).trim();
    if (!raw) return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(raw);
    if (!m) return null;
    const minutes = Number(m[1]);
    const seconds = Number(m[2]);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
    return (minutes * 60) + seconds;
  }

  function parseClockFromShortDetail(shortDetail: unknown): number | null {
    if (shortDetail === null || shortDetail === undefined) return null;
    const raw = String(shortDetail).trim();
    if (!raw) return null;
    const match = /(\d{1,2}):(\d{2})/.exec(raw);
    if (!match) return null;
    return parseClockSeconds(`${match[1]}:${match[2]}`);
  }

  function parsePeriodFromShortDetail(shortDetail: unknown): number | null {
    if (shortDetail === null || shortDetail === undefined) return null;
    const raw = String(shortDetail).toUpperCase();
    if (!raw) return null;
    if (raw.includes('OT')) return 5;
    const m = /(\d+)(?:ST|ND|RD|TH)/.exec(raw);
    if (!m) return null;
    const p = Number(m[1]);
    return Number.isFinite(p) ? p : null;
  }

  function isCloseGame(event: NBAEvent): boolean {
    const comp = event?.competitions?.[0];
    const status = comp?.status;
    const statusName = status?.type?.name ?? '';
    const liveStatuses = new Set(['STATUS_IN_PROGRESS', 'STATUS_END_PERIOD']);
    if (!liveStatuses.has(statusName)) return false;

    const shortDetail = status?.type?.shortDetail ?? status?.short ?? '';
    const periodCandidate = Number(status?.period ?? NaN);
    const period = Number.isFinite(periodCandidate) && periodCandidate > 0
      ? periodCandidate
      : (parsePeriodFromShortDetail(shortDetail) ?? 0);
    if (period < 4) return false;

    const clockSeconds = parseClockSeconds(status?.clock) ?? parseClockFromShortDetail(shortDetail);
    if (clockSeconds === null || clockSeconds > 5 * 60) return false;

    const awayScore = Number(comp?.competitors?.find((c) => c.homeAway === 'away')?.score ?? NaN);
    const homeScore = Number(comp?.competitors?.find((c) => c.homeAway === 'home')?.score ?? NaN);
    if (!Number.isFinite(awayScore) || !Number.isFinite(homeScore)) return false;

    return Math.abs(awayScore - homeScore) <= 5;
  }

  let scoreboardContainer: HTMLElement;
  onMount(() => {
    try {
      const v = localStorage.getItem('arrnba.hideScores');
      hideScores = v === '1';
    } catch {}

    loadDay(currentIndex, true).catch(() => {});
    loadDay(currentIndex - 1).catch(() => {});
    loadDay(currentIndex + 1).catch(() => {});
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        suppressInitialTrackAnimation = false;
      });
    });
    setTimeout(() => {
      prefetchScheduleWindow().catch(() => {});
    }, 1200);

    interval = setInterval(() => {
      handleLocalDayRolloverIfNeeded();
      if (!isTodaySelected()) return;
      loadDay(currentIndex, true).catch(() => {});
    }, 10000);

    createTouchGestures({
      target: scoreboardContainer,
      onSwipeRight: () => snapToIndex(currentIndex - 1),
      onSwipeLeft: () => snapToIndex(currentIndex + 1),
      onHorizontalDrag: handleSwipeDrag,
      onGestureEnd: handleGestureEnd,
      threshold: 50
    });

  });

  onDestroy(() => {
    if (interval) clearInterval(interval);
    if (trackAnimationTimer) clearTimeout(trackAnimationTimer);
  });
</script>

<div bind:this={scoreboardContainer} class="p-4 min-h-screen swipe-area" style="touch-action: pan-y;" role="presentation" on:touchstart={cancelTrackAnimationForTap}>
  <div class="grid grid-cols-[1fr_auto_1fr] items-end mb-4" data-no-swipe="true">
    <div class="justify-self-start h-9 w-9" data-no-swipe="true" aria-hidden="true"></div>
    <div class="justify-self-center" data-no-swipe="true">
      <div class="flex items-center bg-white/5 border border-white/10 rounded overflow-hidden">
        <button data-no-swipe="true" class="px-2.5 py-1 hover:bg-white/10 border-r border-white/10" on:pointerup={() => requestDateDelta(-1)} on:click={() => requestDateDelta(-1)}>&lt;</button>
        <button
          data-no-swipe="true"
          type="button"
          class="px-3 py-1 text-sm font-medium min-w-[140px] text-center hover:bg-white/10"
          on:pointerup={requestOpenDatePicker}
          on:click|preventDefault={requestOpenDatePicker}
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
          {#if i === currentIndex}
            {#if dayLoading.has(i) && currentDisplayEvents.length === 0}
              <div class="text-white/70">Loading games...</div>
            {:else if currentDisplayEvents.length === 0}
              <div class="text-white/70">No games found...</div>
            {:else}
              <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {#each cardsForEvents(currentDisplayEvents) as game (game.id)}
                  <a href={`/game/${game.id}`} on:mouseenter={() => prewarmGameData(game)} on:pointerdown={() => prewarmGameData(game)} on:touchstart={() => prewarmGameData(game)} on:pointerup={() => openGame(game.id)} on:click|preventDefault={() => openGame(game.id)} class="block border rounded p-3 {isCloseGame(game.event) ? 'border-red-500/80 hover:border-red-400' : 'border-white/10 hover:border-white/20'}" style="touch-action: manipulation;">
                    <div class="grid grid-cols-[auto_1fr_auto_1fr_auto] gap-x-2 items-center">
                      <div class="row-span-2 justify-self-center h-12 w-12 flex items-center justify-center overflow-hidden">
                        <img
                          src={game.awayLogo}
                          alt="away"
                          class="h-12 w-12 object-contain"
                          loading="lazy"
                          decoding="async"
                          style={getTeamLogoScaleStyleByAbbr(game.awayAbbr)}
                          on:error={hideBrokenImage}
                        />
                      </div>
                      <div class="text-center font-medium">{game.awayAbbr}</div>
                      <div class="text-center text-white/70 font-medium">@</div>
                      <div class="text-center font-medium">{game.homeAbbr}</div>
                      <div class="row-span-2 justify-self-center h-12 w-12 flex items-center justify-center overflow-hidden">
                        <img
                          src={game.homeLogo}
                          alt="home"
                          class="h-12 w-12 object-contain"
                          loading="lazy"
                          decoding="async"
                          style={getTeamLogoScaleStyleByAbbr(game.homeAbbr)}
                          on:error={hideBrokenImage}
                        />
                      </div>
                      <div class="text-center">{(game.scheduled || hideScores) ? '-' : game.awayScore}</div>
                      <div class="text-center text-white/70 whitespace-nowrap">{game.statusText}</div>
                      <div class="text-center">{(game.scheduled || hideScores) ? '-' : game.homeScore}</div>
                    </div>
                  </a>
                {/each}
              </div>
            {/if}
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>
