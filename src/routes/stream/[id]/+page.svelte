<script lang="ts">
  import { onMount } from 'svelte';
  import Hls from 'hls.js';
  import { nbaService } from '../../../lib/services/nba.service';
  import { findSharkStreamByTeams, STREAM_FALLBACK } from '../../../lib/utils/stream.utils';
  import type { BoxscoreResponse } from '../../../lib/types/nba';

  export let data: { id: string };

  let loading = true;
  let title = 'Live Stream';
  let streamUrl = '';
  let streamMode: 'video' | 'embed' | 'external' = 'embed';
  let error = '';
  let videoEl: HTMLVideoElement | null = null;
  let hls: Hls | null = null;
  let isDirectStream = false;
  let stallWatchdog: ReturnType<typeof setInterval> | null = null;
  let lastKnownTime = 0;
  let stalledTicks = 0;
  let recoverAttempts = 0;
  let lastRecoverAt = 0;

  function inferMode(url: string, preferredMode?: string | null): 'video' | 'embed' | 'external' {
    if (preferredMode === 'video' || preferredMode === 'embed' || preferredMode === 'external') return preferredMode;
    const lower = (url || '').toLowerCase();
    if (lower.includes('.m3u8') || lower.includes('.mp4')) return 'video';
    return 'embed';
  }

  async function resolveStream(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const urlFromQuery = params.get('url') || '';
    const modeFromQuery = params.get('mode');

    if (urlFromQuery) {
      streamUrl = urlFromQuery;
      streamMode = inferMode(urlFromQuery, modeFromQuery);
      isDirectStream = urlFromQuery.includes('chunks.m3u8');
      return;
    }

    let payload: BoxscoreResponse | null = nbaService.getCachedBoxscore(data.id);
    if (!payload) {
      payload = await nbaService.getBoxscore(data.id);
    }

    const away = payload?.linescores?.away?.team?.displayName || '';
    const home = payload?.linescores?.home?.team?.displayName || '';
    title = away && home ? `${away} vs ${home}` : title;

    const resolved = await findSharkStreamByTeams(away, home);
    if (resolved) {
      streamUrl = resolved.url;
      streamMode = resolved.mode;
      return;
    }

    streamUrl = STREAM_FALLBACK.url;
    streamMode = STREAM_FALLBACK.mode;
  }

  function detachHls(): void {
    if (hls) {
      hls.destroy();
      hls = null;
    }
    if (stallWatchdog) {
      clearInterval(stallWatchdog);
      stallWatchdog = null;
    }
    lastKnownTime = 0;
    stalledTicks = 0;
    recoverAttempts = 0;
    lastRecoverAt = 0;
  }

  function attachVideo(): void {
    if (!videoEl || !streamUrl || streamMode !== 'video') return;
    detachHls();
    const isHls = streamUrl.toLowerCase().includes('.m3u8');

    if (!isHls) {
      videoEl.src = streamUrl;
      return;
    }

    const nativeHls = videoEl.canPlayType('application/vnd.apple.mpegurl') !== '';
    if (nativeHls) {
      videoEl.src = streamUrl;
      return;
    }

    if (!Hls.isSupported()) return;
    const config = isDirectStream
      ? {
          enableWorker: true,
          lowLatencyMode: true,
          maxBufferLength: 8,
          maxBufferSize: 8 * 1000 * 1000,
          liveSyncDurationCount: 1,
          liveMaxLatencyDurationCount: 3,
          maxLiveSyncPlaybackRate: 1.5,
          backBufferLength: 0
        }
      : { enableWorker: true };
    hls = new Hls(config);
    if (isDirectStream) {
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data?.fatal) return;
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls?.startLoad();
          return;
        }
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls?.recoverMediaError();
          return;
        }
        detachHls();
      });
    }
    hls.loadSource(streamUrl);
    hls.attachMedia(videoEl);

    if (isDirectStream) {
      if (stallWatchdog) clearInterval(stallWatchdog);
      stalledTicks = 0;
      lastKnownTime = videoEl.currentTime || 0;
      stallWatchdog = setInterval(() => {
        if (!videoEl || videoEl.paused || !hls) return;
        const t = videoEl.currentTime || 0;
        if (t > lastKnownTime + 0.01) {
          lastKnownTime = t;
          stalledTicks = 0;
          return;
        }
        stalledTicks += 1;
        if (stalledTicks < 3) return;
        stalledTicks = 0;
        try {
          const now = Date.now();
          if (now - lastRecoverAt > 15_000) {
            recoverAttempts = 0;
          }
          lastRecoverAt = now;
          recoverAttempts += 1;

          if (recoverAttempts <= 2) {
            hls.startLoad();
            void videoEl.play().catch(() => {});
          } else {
            // Hard reload after repeated stalls.
            detachHls();
            attachVideo();
          }
        } catch {}
      }, 3000);
    }
  }

  function openExternal(url: string): void {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  onMount(async () => {
    try {
      await resolveStream();
    } catch (e) {
      error = e instanceof Error ? e.message : 'Failed to resolve stream';
    } finally {
      loading = false;
    }
  });

  $: if (!loading && streamMode === 'video' && videoEl && streamUrl) {
    attachVideo();
  }
</script>

<div class="min-h-screen bg-black text-white">
  <div class="sticky top-0 z-10 flex items-center justify-between border-b border-white/15 bg-black/90 px-3 py-2 text-sm">
    <button class="text-white/70 hover:text-white" on:click={() => history.back()}>Back</button>
    <div class="truncate px-2 text-white/80">{title}</div>
    <button class="text-white/70 hover:text-white" on:click={() => location.reload()}>Reload</button>
  </div>

  {#if loading}
    <div class="flex h-[70vh] items-center justify-center text-white/70">Loading stream...</div>
  {:else if error}
    <div class="p-4 text-sm text-red-300">{error}</div>
  {:else if streamMode === 'video'}
    <video
      bind:this={videoEl}
      class="h-[calc(100vh-42px)] w-full bg-black"
      controls
      autoplay
      playsinline
    ></video>
  {:else if streamMode === 'external'}
    <div class="flex h-[70vh] items-center justify-center p-4">
      <button
        class="rounded border border-white/20 bg-white/10 px-4 py-2 text-sm text-white/90 hover:bg-white/15"
        on:click={() => openExternal(streamUrl)}
      >
        Open Stream
      </button>
    </div>
  {:else}
    <iframe
      src={streamUrl}
      title="Stream"
      class="h-[calc(100vh-42px)] w-full bg-black"
      allowfullscreen
      scrolling="no"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
    ></iframe>
  {/if}
</div>
