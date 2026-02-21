<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import BoxScoreToggle from '../../../lib/components/BoxScoreToggle.svelte';
  import RedditFeedClient from '../../../lib/components/RedditFeedClient.svelte';
  import StreamOverlay from '../../../lib/components/StreamOverlay.svelte';
  import { nbaService } from '../../../lib/services/nba.service';
  import { toScoreboardDateKey } from '../../../lib/utils/scoreboard.utils';
  import { getTeamLogoAbbr, getTeamLogoPath, getTeamLogoScaleStyle } from '../../../lib/utils/team.utils';
  import type { BoxscoreResponse } from '../../../lib/types/nba';
  import type { Event as NBAEvent } from '../../../lib/types/nba';
  type StreamSource = { label: string; url: string; mode?: 'auto' | 'video' | 'embed' | 'external' };
  
  export let data: { id: string; streamed?: { payload?: Promise<BoxscoreResponse> } };
  let payload: BoxscoreResponse | null = nbaService.getCachedBoxscore(data.id);
  let interval: any;
  let scoreboardInterval: any;
  let handledStreamedPayload: Promise<BoxscoreResponse> | undefined;
  let redditPrewarmedForGame = false;
  let uiMode: 'LIVE' | 'STATS' | 'POST' = 'STATS';
  let uiSide: 'home' | 'away' = 'away';
  let uiSourceLive: 'reddit' | 'away' | 'home' = 'reddit';
  let uiSourcePost: 'reddit' | 'away' | 'home' = 'reddit';
  let showHighlightsInsteadOfStream = false;
  let youtubeHighlightSources: StreamSource[] = [];
  let youtubeHighlightsKey = '';
  let youtubeHighlightsLoading = false;
  const FINAL_HIGHLIGHTS_DELAY_MS = 5 * 60 * 1000;
  const ESTIMATED_GAME_DURATION_MS = 4 * 60 * 60 * 1000;
 
  let dynamicStreams: StreamSource[] = [];
  let streamsLoading = false;
  let streamResolvedForGameId = '';
  const STREAM_URL_TEMPLATE = 'https://cdn{index}.test.com/live/cdn{index}/chunks.m3u8';
  const placeholderStreams = [
    { label: 'Stream (Fallback)', url: 'https://cdn1.test.com/live/cdn1/chunks.m3u8', mode: 'video' as const }
  ];

  function buildTemplateStreamUrl(gameIndex: number): string {
    const safeIndex = Math.max(1, Math.trunc(gameIndex));
    return STREAM_URL_TEMPLATE.replaceAll('{index}', String(safeIndex));
  }

  async function resolveTemplateStreamForGame(): Promise<void> {
    if (!payload?.id || !payload?.eventDate) return;
    if (streamsLoading) return;
    if (streamResolvedForGameId === payload.id) return;

    streamsLoading = true;
    try {
      const date = new Date(payload.eventDate);
      const keys = [
        toScoreboardDateKey(new Date(date.getTime() - 24 * 60 * 60 * 1000)),
        toScoreboardDateKey(date),
        toScoreboardDateKey(new Date(date.getTime() + 24 * 60 * 60 * 1000))
      ];
      const boards = await Promise.all(keys.map((key) => nbaService.getScoreboard(key, true)));
      const events = [...boards.flatMap((board) => board?.events ?? [])]
        .sort((a: any, b: any) => {
          const at = Date.parse(String(a?.date ?? '')) || 0;
          const bt = Date.parse(String(b?.date ?? '')) || 0;
          if (at !== bt) return at - bt;
          return String(a?.id ?? '').localeCompare(String(b?.id ?? ''));
        });
      const idx = events.findIndex((event: any) => String(event?.id) === String(payload.id));
      const gameIndex = idx >= 0 ? idx + 1 : 1;
      const streamUrl = buildTemplateStreamUrl(gameIndex);

      dynamicStreams = [
        {
          label: `Game ${gameIndex} Stream`,
          url: streamUrl,
          mode: 'video'
        }
      ];
      streamResolvedForGameId = payload.id;
      console.log('[stream][template] resolved', { gameId: payload.id, gameIndex, streamUrl });
    } catch (error) {
      console.error('[stream][template] failed to resolve stream url', error);
    } finally {
      streamsLoading = false;
    }
  }

  $: if (payload?.id && payload?.eventDate && dynamicStreams.length === 0 && !streamsLoading) {
    resolveTemplateStreamForGame();
  }

  if (typeof window !== 'undefined') {
    const search = new URLSearchParams(window.location.search);
    const modeParam = (search.get('mode') || '').toUpperCase();
    const sideParam = (search.get('side') || '').toLowerCase();
    const sourceParam = (search.get('source') || '').toLowerCase();
    const sourceLiveParam = (search.get('sourceLive') || '').toLowerCase();
    const sourcePostParam = (search.get('sourcePost') || '').toLowerCase();

    if (modeParam === 'LIVE' || modeParam === 'STATS' || modeParam === 'POST') uiMode = modeParam;
    if (sideParam === 'home' || sideParam === 'away') uiSide = sideParam;
    if (sourceParam === 'reddit' || sourceParam === 'away' || sourceParam === 'home') {
      uiSourceLive = sourceParam;
      uiSourcePost = sourceParam;
    }
    if (sourceLiveParam === 'reddit' || sourceLiveParam === 'away' || sourceLiveParam === 'home') uiSourceLive = sourceLiveParam;
    if (sourcePostParam === 'reddit' || sourcePostParam === 'away' || sourcePostParam === 'home') uiSourcePost = sourcePostParam;
  }

  function writeUiStateToUrl(): void {
    if (typeof window === 'undefined') return;
    const next = new URL(window.location.href);
    next.searchParams.set('mode', uiMode);
    next.searchParams.set('side', uiSide);
    next.searchParams.set('sourceLive', uiSourceLive);
    next.searchParams.set('sourcePost', uiSourcePost);
    next.searchParams.delete('source');
    window.history.replaceState(window.history.state, '', `${next.pathname}${next.search}`);
  }

  function handleViewStateChange(state: { mode: 'LIVE' | 'STATS' | 'POST'; side: 'home' | 'away' }): void {
    let changed = false;
    if (uiMode !== state.mode) {
      uiMode = state.mode;
      changed = true;
    }
    if (uiSide !== state.side) {
      uiSide = state.side;
      changed = true;
    }
    if (changed) writeUiStateToUrl();
  }

  function handleSourceChange(state: { mode: 'LIVE' | 'POST'; source: 'reddit' | 'away' | 'home' }): void {
    if (state.mode === 'LIVE') {
      if (uiSourceLive === state.source) return;
      uiSourceLive = state.source;
    } else {
      if (uiSourcePost === state.source) return;
      uiSourcePost = state.source;
    }
    writeUiStateToUrl();
  }
  
  async function refresh() {
    try {
      const response = await nbaService.getBoxscore(data.id);
      payload = { ...response };
    } catch (error) {
      console.error('Failed to refresh boxscore:', error);
    }
  }

  function applyScoreboardEvent(event: NBAEvent): void {
    if (!payload) return;

    const comp = event?.competitions?.[0];
    const statusType = comp?.status?.type;
    const competitors = comp?.competitors ?? [];
    const away = competitors.find((c) => c.homeAway === 'away');
    const home = competitors.find((c) => c.homeAway === 'home');

    if (!payload.status) payload.status = {};
    payload.status = {
      ...payload.status,
      name: statusType?.name ?? payload.status?.name,
      short: statusType?.shortDetail ?? payload.status?.short,
      clock: String(comp?.status?.clock ?? payload.status?.clock ?? ''),
      period: Number(comp?.status?.period ?? payload.status?.period ?? 0)
    };

    if (payload.linescores?.away && away) {
      const awayPeriods = (away.linescores ?? [])
        .map((p: any) => Number(p?.value ?? p?.displayValue ?? p))
        .filter((n: number) => Number.isFinite(n));
      payload.linescores.away = {
        ...payload.linescores.away,
        total: Number(away.score ?? payload.linescores.away.total ?? 0),
        periods: awayPeriods.length > 0 ? awayPeriods : payload.linescores.away.periods
      };
    }

    if (payload.linescores?.home && home) {
      const homePeriods = (home.linescores ?? [])
        .map((p: any) => Number(p?.value ?? p?.displayValue ?? p))
        .filter((n: number) => Number.isFinite(n));
      payload.linescores.home = {
        ...payload.linescores.home,
        total: Number(home.score ?? payload.linescores.home.total ?? 0),
        periods: homePeriods.length > 0 ? homePeriods : payload.linescores.home.periods
      };
    }

    payload = { ...payload };
  }

  async function syncLiveFromScoreboard() {
    const eventDate = payload?.eventDate ? new Date(payload.eventDate) : new Date();
    const key = toScoreboardDateKey(eventDate);

    try {
      const board = await nbaService.getScoreboard(key, true);
      const event = (board?.events ?? []).find((e) => String(e.id) === String(data.id));
      if (event) {
        applyScoreboardEvent(event);
      }
    } catch (error) {
      console.error('Failed to sync live game from scoreboard:', error);
    }
  }

  // Handle streamed data
  $: if (data.streamed?.payload) {
    const streamedPayload = data.streamed.payload;
    if (streamedPayload === handledStreamedPayload) {
      // no-op: prevent duplicate .then handlers on same streamed promise
    } else {
      handledStreamedPayload = streamedPayload;
      streamedPayload.then((res: BoxscoreResponse) => {
      if (!payload) payload = res;
      }).catch((err: unknown) => {
        console.error('Failed to load streamed payload:', err);
      });
    }
  }
  
  function isFinalGame(): boolean {
    const name = (payload?.status?.name ?? '').toUpperCase();
    const short = (payload?.status?.short ?? '').toUpperCase();
    return name.includes('FINAL') || short.includes('FINAL');
  }

  function toLocalDateToken(dateStr?: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  function buildYouTubeQuery(): string {
    const awayName = payload?.linescores?.away?.team?.displayName;
    const homeName = payload?.linescores?.home?.team?.displayName;
    const datePart = toLocalDateToken(payload?.eventDate);
    return [awayName, 'vs', homeName, 'full game highlights', 'nba', datePart].filter(Boolean).join(' ');
  }

  function buildYouTubeFallbackQueries(): string[] {
    const awayName = payload?.linescores?.away?.team?.displayName;
    const homeName = payload?.linescores?.home?.team?.displayName;
    const datePart = toLocalDateToken(payload?.eventDate);
    const base = [awayName, 'vs', homeName].filter(Boolean).join(' ');
    if (!base) return [];
    return [
      `${base} full game highlights nba ${datePart}`.trim(),
      `${base} game highlights nba ${datePart}`.trim(),
      `${base} full game highlights nba`.trim(),
      `${base} highlights nba`.trim()
    ];
  }

  function buildYouTubeWatchVideoUrl(videoId: string): string {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
  }

  async function loadYouTubeHighlightsForCurrentGame(): Promise<void> {
    const query = buildYouTubeQuery();
    if (!query) {
      console.log('[highlights][client] skipped: empty query', { gameId: data.id });
      return;
    }
    if (youtubeHighlightsLoading) {
      console.log('[highlights][client] skipped: already loading', { gameId: data.id, query });
      return;
    }
    if (youtubeHighlightsKey === query && youtubeHighlightSources.length > 0) {
      console.log('[highlights][client] skipped: cached sources exist', {
        gameId: data.id,
        query,
        count: youtubeHighlightSources.length
      });
      return;
    }

    youtubeHighlightsLoading = true;
    console.log('[highlights][client] fetching highlights', { gameId: data.id, query });
    try {
      const candidateQueries = Array.from(new Set([query, ...buildYouTubeFallbackQueries()]));
      let nextSources: StreamSource[] = [];

      for (const q of candidateQueries) {
        const apiUrl = `/api/highlights/nba?query=${encodeURIComponent(q)}&limit=8`;
        const response = await fetch(apiUrl);
        if (!response.ok) {
          console.log('[highlights][client] non-ok response', { gameId: data.id, query: q, status: response.status, apiUrl });
          continue;
        }
        const json = await response.json();
        const videos = Array.isArray(json?.videos) ? json.videos : [];
        console.log('[highlights][client] api payload', {
          gameId: data.id,
          query: q,
          videosCount: videos.length,
          error: json?.error ?? null
        });
        nextSources = videos
          .filter((item: any) => typeof item?.id === 'string' && item.id.length > 0)
          .map((item: any, index: number) => ({
            label: String(item?.title || `YouTube Highlight ${index + 1}`),
            url: buildYouTubeWatchVideoUrl(String(item.id)),
            mode: 'external' as const
          }));
        console.log('[highlights][client] mapped sources', {
          gameId: data.id,
          query: q,
          sourcesCount: nextSources.length,
          sample: nextSources[0]?.url ?? null
        });
        if (nextSources.length > 0) break;
      }

      if (nextSources.length > 0) {
        youtubeHighlightSources = nextSources;
        youtubeHighlightsKey = query;
      } else {
        youtubeHighlightSources = [];
      }
    } catch (error) {
      console.error('Failed to load YouTube highlights:', error);
    } finally {
      youtubeHighlightsLoading = false;
    }
  }

  function buildPostGameHighlightSources() {
    return youtubeHighlightSources;
  }

  async function prewarmRedditForCurrentGame() {
    if (redditPrewarmedForGame) return;
    const awayName = payload?.linescores?.away?.team?.displayName;
    const homeName = payload?.linescores?.home?.team?.displayName;
    const eventDate = payload?.eventDate;
    const eventId = payload?.id || data.id;
    if (!awayName || !homeName || !eventId) return;

    redditPrewarmedForGame = true;
    try {
      const liveThread = await nbaService.searchRedditThread({
        type: 'live',
        awayCandidates: [awayName],
        homeCandidates: [homeName],
        eventDate,
        eventId
      });

      const postThread = isFinalGame()
        ? await nbaService.searchRedditThread({
            type: 'post',
            awayCandidates: [awayName],
            homeCandidates: [homeName],
            eventDate,
            eventId
          })
        : null;

      const warmers: Promise<any>[] = [];
      if (liveThread?.post?.id) {
        warmers.push(nbaService.getRedditComments(liveThread.post.id, 'new', liveThread.post.permalink));
      }
      if (postThread?.post?.id) {
        warmers.push(nbaService.getRedditComments(postThread.post.id, 'top', postThread.post.permalink));
      }
      if (warmers.length > 0) {
        await Promise.allSettled(warmers);
      }
    } catch (error) {
      redditPrewarmedForGame = false;
      console.error('Failed to prewarm Reddit threads/comments for game:', error);
    }
  }
  onMount(() => {
    // If payload is still null, try refreshing immediately on client
    if (!payload) {
      refresh();
    }
    syncLiveFromScoreboard();
    interval = setInterval(refresh, 30000);
    scoreboardInterval = setInterval(syncLiveFromScoreboard, 10000);
    
  });
  onDestroy(() => {
    if (interval) clearInterval(interval);
    if (scoreboardInterval) clearInterval(scoreboardInterval);
  });
  
  
  function formatStatus(s: string) {
    const str = (s || '').trim();
    if (!str) return '';
    const m = /Q(\d)\s+([0-9:]+)/i.exec(str);
    if (m) {
      const q = m[1];
      const clock = m[2];
      return `${clock} Q${q}`;
    }
    return str.toUpperCase();
  }

  function hideBrokenImage(event: Event) {
    const img = event.currentTarget as HTMLImageElement | null;
    if (img) img.style.display = 'none';
  }

  function formatHeaderDate(dateStr?: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  $: if (payload?.linescores?.away?.team?.displayName && payload?.linescores?.home?.team?.displayName) {
    prewarmRedditForCurrentGame();
  }

  $: if (showHighlightsInsteadOfStream && payload?.linescores?.away?.team?.displayName && payload?.linescores?.home?.team?.displayName) {
    loadYouTubeHighlightsForCurrentGame();
  }

  $: {
    if (!isFinalGame()) {
      showHighlightsInsteadOfStream = false;
    } else {
      const startMs = Date.parse(payload?.eventDate ?? '');
      if (!Number.isFinite(startMs)) {
        showHighlightsInsteadOfStream = false;
      } else {
        const cutoffMs = startMs + ESTIMATED_GAME_DURATION_MS + FINAL_HIGHLIGHTS_DELAY_MS;
        showHighlightsInsteadOfStream = Date.now() >= cutoffMs;
      }
    }
  }
</script>

<div class="p-4 min-h-screen flex flex-col">
  {#if showHighlightsInsteadOfStream}
    {#if youtubeHighlightSources.length > 0}
      <StreamOverlay
        title="Game Highlights"
        sources={buildPostGameHighlightSources()}
        storageKey={`arrnba.highlightsOverlay.${data.id}`}
        closedButtonLabel="Open Highlights"
      />
    {:else if youtubeHighlightsLoading}
      <div class="fixed bottom-3 right-3 z-50 rounded border border-white/20 bg-black/90 px-3 py-1.5 text-xs text-white/80">
        Loading Highlights...
      </div>
    {:else}
      <div class="fixed bottom-3 right-3 z-50 rounded border border-white/20 bg-black/90 px-3 py-1.5 text-xs text-white/80">
        No Highlights Found
      </div>
    {/if} 
    {:else}
    <StreamOverlay 
      title={streamsLoading ? "Searching..." : "Live Stream"} 
      sources={dynamicStreams.length > 0 ? dynamicStreams : placeholderStreams} 
      storageKey={`arrnba.streamOverlay.${data.id}`} 
      secondaryButtonLabel="Open Example"
      secondaryIframeUrl="https://sharkstreams.net/player.php?channel=1363"
    />
  {/if}
  <div class="grid grid-cols-[auto_1fr_auto] items-center mb-2">
    <button class="text-white/70 hover:text-white justify-self-start" on:click={() => history.back()}>Back</button>
    <div class="text-center text-sm text-white/75 font-medium">{formatHeaderDate(payload?.eventDate)}</div>
    <button class="invisible pointer-events-none justify-self-end" tabindex="-1" aria-hidden="true">Back</button>
  </div>
  <div class="mt-2 mb-2 min-h-[60px] swipe-area">
    {#if payload?.linescores}
      <div class="flex items-center justify-between text-lg font-semibold">
        <div class="flex items-center gap-2">
          <img
            src={getTeamLogoPath(payload?.linescores?.away?.team)}
            alt="away"
            width="28" height="28" loading="eager" decoding="async"
            style={getTeamLogoScaleStyle(payload?.linescores?.away?.team)}
            on:error={hideBrokenImage}
          />
          <span>{getTeamLogoAbbr(payload?.linescores?.away?.team)}</span>
        </div>
        <span>{payload?.linescores?.away?.total} - {payload?.linescores?.home?.total}</span>
        <div class="flex items-center gap-2">
          <span>{getTeamLogoAbbr(payload?.linescores?.home?.team)}</span>
          <img
            src={getTeamLogoPath(payload?.linescores?.home?.team)}
            alt="home"
            width="28" height="28" loading="eager" decoding="async"
            style={getTeamLogoScaleStyle(payload?.linescores?.home?.team)}
            on:error={hideBrokenImage}
          />
        </div>
      </div>
      <div class="text-center text-white/70 text-sm mt-1">
        {#if payload?.status?.name && payload?.status?.name?.toUpperCase()?.includes('FINAL')}
          FINAL
        {:else if payload?.status?.short}
          {formatStatus(payload?.status?.short)}
        {:else}
          {formatStatus(payload?.status?.clock && payload?.status?.period ? `Q${payload?.status?.period} ${payload?.status?.clock}` : '')}
        {/if}
      </div>
    {/if}
  </div>
  {#if payload?.error && !payload?.linescores}
    <div class="text-red-400">{payload.error}</div>
  {:else if payload?.linescores}
    <div class="flex-1 min-h-[40vh]">
      <BoxScoreToggle players={payload.players} linescores={payload.linescores} initialMode={uiMode} initialSide={uiSide} onViewStateChange={handleViewStateChange}>
        <div slot="reddit" let:mode let:side>
          <RedditFeedClient awayName={payload?.linescores?.away?.team?.displayName} homeName={payload?.linescores?.home?.team?.displayName} eventDate={payload?.eventDate} eventId={payload?.id || data.id} initialSourceLive={uiSourceLive} initialSourcePost={uiSourcePost} onSourceChange={handleSourceChange} {mode} />
        </div>
      </BoxScoreToggle>
    </div>
  {:else}
    <div class="flex items-center justify-center py-8">
      <div class="animate-spin w-8 h-8 border-4 border-white/10 border-t-white/70 rounded-full"></div>
    </div>
  {/if}
</div>
