<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { nbaService } from '../lib/services/nba.service';
  import { getTeamLogoAbbr } from '../lib/utils/team.utils';
  import { createTouchGestures } from '../lib/composables/touch-gestures';
  import type { Event } from '../lib/types/nba';
  
  export let data: { events: Event[] };
  let events = data.events ?? [];
  let interval: any;
  let selectedDate = new Date();

  function getFormatDate(date: Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}${m}${d}`;
  }

  async function refresh() {
    try {
      const targetDateStr = selectedDate.toDateString();
      
      // Save date to sessionStorage so it's remembered when coming back
      try {
        sessionStorage.setItem('arrnba.selectedDate', selectedDate.toISOString());
      } catch (e) {}
      
      // Calculate the three US days we need to check to cover our local day
      const currentDay = new Date(selectedDate);
      const prevDay = new Date(selectedDate);
      prevDay.setDate(prevDay.getDate() - 1);
      const nextDay = new Date(selectedDate);
      nextDay.setDate(nextDay.getDate() + 1);

      const isOnTargetDay = (e: any) => {
        try {
          return new Date(e.date).toDateString() === targetDateStr;
        } catch { return false; }
      };

      // 1. Check if we already have the main day in cache to avoid layout flicker
      const cached = await nbaService.getScoreboard(getFormatDate(currentDay));
      if (cached && cached.events) {
        // If we have any data cached for today, show it immediately while background fetch completes the 3-day window
        events = (cached.events ?? []).filter(isOnTargetDay);
      }

      // 2. Fetch all three days in parallel for maximum speed
      const [response, prevResponse, nextResponse] = await Promise.all([
        nbaService.getScoreboard(getFormatDate(currentDay)),
        nbaService.getScoreboard(getFormatDate(prevDay)),
        nbaService.getScoreboard(getFormatDate(nextDay))
      ]);
      
      const fromCurrent = (response.events ?? []).filter(isOnTargetDay);
      const fromPrev = (prevResponse.events ?? []).filter(isOnTargetDay);
      const fromNext = (nextResponse.events ?? []).filter(isOnTargetDay);

      // Combine and deduplicate
      const allMatches = [...fromPrev, ...fromCurrent, ...fromNext];
      const uniqueEvents = Array.from(new Map(allMatches.map(e => [e.id, e])).values());

      // Sort by date
      uniqueEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      
      events = uniqueEvents;
      prewarmBoxscores(events);
      
      // Pre-warm the adjacent days in the background to make next swipes instant
      const dayAfter = new Date(selectedDate);
      dayAfter.setDate(dayAfter.getDate() + 2); // We already fetched selectedDate + 1
      const dayBefore = new Date(selectedDate);
      dayBefore.setDate(dayBefore.getDate() - 2); // We already fetched selectedDate - 1
      
      nbaService.getScoreboard(getFormatDate(dayAfter)).catch(() => {});
      nbaService.getScoreboard(getFormatDate(dayBefore)).catch(() => {});

    } catch (error) {
      console.error('Failed to refresh scoreboard:', error);
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
  async function prewarmRedditData(event: Event) {
    // Clear any pending prewarm to avoid spamming during swipes
    if (prewarmTimeout) clearTimeout(prewarmTimeout);
    
    // Delay pre-warming slightly. If it's a swipe, this will be cancelled or ignored.
    prewarmTimeout = setTimeout(async () => {
      const awayName = event?.competitions?.[0]?.competitors?.find((c)=>c.homeAway==='away')?.team?.displayName;
      const homeName = event?.competitions?.[0]?.competitors?.find((c)=>c.homeAway==='home')?.team?.displayName;
      
      if (!awayName || !homeName) return;
      
      const pairKey = [normalizeMascot(awayName), normalizeMascot(homeName)].sort().join('|');
      
      try {
        // 1. Load Reddit Index (it's a shared promise, so safe to call repeatedly)
        const mapping = await nbaService.getRedditIndex();
        const entry = mapping?.[pairKey];
        
        let liveThread = entry?.gdt;
        let postThread = entry?.pgt;
        
        // 2. Search for threads if not in index
        const searchPromises = [];
        if (!liveThread) {
          searchPromises.push(
            nbaService.searchRedditThread({
              type: 'live',
              awayCandidates: [awayName],
              homeCandidates: [homeName]
            }).then(res => { if (res.post) liveThread = res.post; })
          );
        }
        if (!postThread) {
          searchPromises.push(
            nbaService.searchRedditThread({
              type: 'post',
              awayCandidates: [awayName],
              homeCandidates: [homeName]
            }).then(res => { if (res.post) postThread = res.post; })
          );
        }
        if (searchPromises.length > 0) await Promise.allSettled(searchPromises);
        
        // 3. Pre-fetch comments for both threads in the background
        if (liveThread) {
          nbaService.getRedditComments(liveThread.id, 'new', liveThread.permalink).catch(() => {});
        }
        if (postThread) {
          nbaService.getRedditComments(postThread.id, 'top', postThread.permalink).catch(() => {});
        }
        
      } catch (error) {
        console.error(`Failed to preload Reddit data for ${awayName} vs ${homeName}:`, error);
      }
    }, 150); // 150ms delay to differentiate tap/hover from swipe
  }

  async function prewarmBoxscores(eventList: Event[]) {
    try {
      const ids = eventList.map(e => e.id).filter(Boolean);
      if (ids.length === 0) return;
      
      // Sequence pre-warming to avoid overwhelming with simultaneous requests
      // but do it in background
      for (const id of ids) {
        nbaService.getBoxscore(id).catch(() => {});
      }
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

  function stateBadge(event: any) {
    const comp = event?.competitions?.[0];
    const status = comp?.status?.type?.description ?? '';
    return status;
  }

  function formatLocalTime(dateStr: string) {
    try {
      const date = new Date(dateStr);
      return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
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
  onMount(() => {
    try {
      const v = localStorage.getItem('arrnba.hideScores');
      hideScores = v === '1';
    } catch {}
  });
  function normalizeMascot(name: string): string {
    const s = (name || '').toLowerCase();
    if (s.includes('trail blazers')) return 'Trail Blazers';
    return name;
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
          <div class="grid grid-cols-5 grid-rows-2 gap-x-3 items-center">
            <div class="row-span-2 justify-self-center">
              <img
                src={`/logos/${getTeamLogoAbbr(e?.competitions?.[0]?.competitors?.find((c)=>c.homeAway==='away')?.team)}.svg`}
                alt="away"
                width="48" height="48" loading="lazy" decoding="async"
                on:error={(event) => { (event.currentTarget).style.display='none'; }}
              />
            </div>
            <div class="text-center font-medium">
              {getTeamLogoAbbr(e?.competitions?.[0]?.competitors?.find((c)=>c.homeAway==='away')?.team)}
            </div>
            <div class="text-center text-white/70 font-medium">@</div>
            <div class="text-center font-medium">
              {getTeamLogoAbbr(e?.competitions?.[0]?.competitors?.find((c)=>c.homeAway==='home')?.team)}
            </div>
            <div class="row-span-2 justify-self-center">
              <img
                src={`/logos/${getTeamLogoAbbr(e?.competitions?.[0]?.competitors?.find((c)=>c.homeAway==='home')?.team)}.svg`}
                alt="home"
                width="48" height="48" loading="lazy" decoding="async"
                on:error={(event) => { (event.currentTarget).style.display='none'; }}
              />
            </div>
            <div class="text-right">
              {hideScores ? '-' : e?.competitions?.[0]?.competitors?.find((c)=>c.homeAway==='away')?.score}
            </div>
            <div class="text-center text-white/70">
              {#if e?.competitions?.[0]?.status?.type?.name === 'STATUS_SCHEDULED'}
                {formatLocalTime(e.date)}
              {:else}
                {e?.competitions?.[0]?.status?.type?.shortDetail}
              {/if}
            </div>
            <div class="text-left">
              {hideScores ? '-' : e?.competitions?.[0]?.competitors?.find((c)=>c.homeAway==='home')?.score}
            </div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
