<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import BoxScoreToggle from '../../../lib/components/BoxScoreToggle.svelte';
  import RedditFeedClient from '../../../lib/components/RedditFeedClient.svelte';
  import { nbaService } from '../../../lib/services/nba.service';
  import { refreshLiveRedditForMatch } from '../../../lib/services/reddit-prewarm.service';
  import { getTeamLogoAbbr } from '../../../lib/utils/team.utils';
  import type { BoxscoreResponse } from '../../../lib/types/nba';
  
  export let data: { id: string; streamed?: { payload?: Promise<BoxscoreResponse> } };
  let payload: BoxscoreResponse | null = null;
  let interval: any;
  let redditInterval: any;
  let handledStreamedPayload: Promise<BoxscoreResponse> | undefined;
  let redditPrewarmedForGame = false;
  
  async function refresh() {
    try {
      const response = await nbaService.getBoxscore(data.id);
      payload = { ...response };
    } catch (error) {
      console.error('Failed to refresh boxscore:', error);
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
  
  async function refreshRedditData() {
    const awayName = payload?.linescores?.away?.team?.displayName;
    const homeName = payload?.linescores?.home?.team?.displayName;
    
    if (!awayName || !homeName) return;

    try {
      await refreshLiveRedditForMatch(nbaService, awayName, homeName);
    } catch (error) {
      console.error('Failed to refresh Reddit data:', error);
    }
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
      const [liveThread, postThread] = await Promise.all([
        nbaService.searchRedditThread({
          type: 'live',
          awayCandidates: [awayName],
          homeCandidates: [homeName],
          eventDate,
          eventId
        }),
        nbaService.searchRedditThread({
          type: 'post',
          awayCandidates: [awayName],
          homeCandidates: [homeName],
          eventDate,
          eventId
        })
      ]);

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
    interval = setInterval(refresh, 15000);
    
    // Continue with periodic refresh
    redditInterval = setInterval(refreshRedditData, 30000); // Refresh Reddit every 30 seconds
  });
  onDestroy(() => {
    if (interval) clearInterval(interval);
    if (redditInterval) clearInterval(redditInterval);
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

  $: if (payload?.linescores?.away?.team?.displayName && payload?.linescores?.home?.team?.displayName) {
    prewarmRedditForCurrentGame();
  }
</script>

<div class="p-4">
  <button class="text-white/70 hover:text-white" on:click={() => history.back()}>Back</button>
  <div class="mt-2 mb-2 min-h-[60px] swipe-area">
    {#if payload?.linescores}
      <div class="flex items-center justify-between text-lg font-semibold">
        <div class="flex items-center gap-2">
          <img
            src={`/logos/${getTeamLogoAbbr(payload?.linescores?.away?.team)}.svg`}
            alt="away"
            width="28" height="28" loading="eager" decoding="async"
            on:error={hideBrokenImage}
          />
          <span>{getTeamLogoAbbr(payload?.linescores?.away?.team)}</span>
        </div>
        <span>{payload?.linescores?.away?.total} - {payload?.linescores?.home?.total}</span>
        <div class="flex items-center gap-2">
          <span>{getTeamLogoAbbr(payload?.linescores?.home?.team)}</span>
          <img
            src={`/logos/${getTeamLogoAbbr(payload?.linescores?.home?.team)}.svg`}
            alt="home"
            width="28" height="28" loading="eager" decoding="async"
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
    <BoxScoreToggle players={payload.players} linescores={payload.linescores}>
      <div slot="reddit" let:mode let:side>
        <RedditFeedClient awayName={payload?.linescores?.away?.team?.displayName} homeName={payload?.linescores?.home?.team?.displayName} eventDate={payload?.eventDate} eventId={payload?.id || data.id} {mode} />
      </div>
    </BoxScoreToggle>
  {:else}
    <div class="flex items-center justify-center py-8">
      <div class="animate-spin w-8 h-8 border-4 border-white/10 border-t-white/70 rounded-full"></div>
    </div>
  {/if}
</div>

