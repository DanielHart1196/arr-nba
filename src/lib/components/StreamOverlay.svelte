<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import Hls from 'hls.js';

  type StreamSource = { label: string; url: string; mode?: 'auto' | 'video' | 'embed' | 'external' };

  export let title = 'Live Stream';
  export let streamUrl = '';
  export let sources: StreamSource[] = [];
  export let storageKey = 'arrnba.streamOverlay.v1';
  export let closedButtonLabel = 'Open Stream';
  export let openToken = 0;
  export let showClosedButton = true;
  export let secondaryButtonLabel = '';
  export let secondaryIframeUrl = '';
  export let secondaryExternalUrl = '';
  export let secondaryExternalLabel = '';

  let rootEl: HTMLDivElement | null = null;
  let videoEl: HTMLVideoElement | null = null;
  let hls: Hls | null = null;
  let stallWatchdog: ReturnType<typeof setInterval> | null = null;
  let lastKnownCurrentTime = 0;
  let stalledTicks = 0;
  let sourceAttachedAtMs = 0;
  let lastAutoRecoverAtMs = 0;
  let videoDiagAttachedTo: HTMLVideoElement | null = null;
  let onVideoError: ((this: HTMLVideoElement, ev: Event) => any) | null = null;
  let onVideoStalled: ((this: HTMLVideoElement, ev: Event) => any) | null = null;
  let onVideoWaiting: ((this: HTMLVideoElement, ev: Event) => any) | null = null;
  let onVideoLoadedMeta: ((this: HTMLVideoElement, ev: Event) => any) | null = null;
  let onVideoCanPlay: ((this: HTMLVideoElement, ev: Event) => any) | null = null;
  let onVideoPlaying: ((this: HTMLVideoElement, ev: Event) => any) | null = null;
  let onVideoPause: ((this: HTMLVideoElement, ev: Event) => any) | null = null;
  let onVideoEnded: ((this: HTMLVideoElement, ev: Event) => any) | null = null;
  let onVideoTimeUpdate: ((this: HTMLVideoElement, ev: Event) => any) | null = null;
  let onVideoProgress: ((this: HTMLVideoElement, ev: Event) => any) | null = null;
  let diagnosticsTicker: ReturnType<typeof setInterval> | null = null;
  let showDiagnostics = false;
  let diagnosticsLog: string[] = [];
  let diagnosticsState = {
    currentTime: 0,
    duration: 0,
    bufferedEnd: 0,
    readyState: 0,
    networkState: 0,
    paused: true,
    ended: false,
    hlsLiveSyncPosition: null as number | null
  };

  let visible = false;
  let minimized = false;
  let muted = true;
  let mobileLocked = false;
  let selectedIndex = 0;
  let overrideUrl = '';
  let overrideMode: 'video' | 'embed' | 'external' | null = null;

  let x = 16;
  let y = 16;
  let width = 380;
  let height = 214;

  let lastOpenToken = 0;

  let dragging = false;
  let resizing = false;
  let dragCandidate = false;
  let startPointerX = 0;
  let startPointerY = 0;
  let startX = 0;
  let startY = 0;
  let startWidth = 0;
  let startHeight = 0;

  const MIN_WIDTH = 260;
  const MAX_WIDTH = 780;
  const EDGE_PAD = 8;
  const ASPECT = 16 / 9;

  $: selectedSource = sources[selectedIndex] ?? null;
  $: activeUrl = overrideUrl || selectedSource?.url || streamUrl;
  $: titleText = selectedSource ? `${title} - ${selectedSource.label}` : title;
  $: activeMode = resolveMode(overrideMode, selectedSource, activeUrl);
  $: console.log('[stream][overlay] resolved', {
    title,
    selectedIndex,
    sourceMode: selectedSource?.mode ?? null,
    activeMode,
    activeUrl
  });
  $: {
    if (activeMode === 'video' && videoEl && activeUrl) {
      console.log('[stream][overlay] video attach trigger', {
        hasVideoEl: Boolean(videoEl),
        activeUrl
      });
      void attachVideoSource();
    } else {
      if (activeMode === 'video') {
        console.log('[stream][overlay] video attach skipped', {
          hasVideoEl: Boolean(videoEl),
          hasActiveUrl: Boolean(activeUrl)
        });
      }
      detachHls();
    }
  }
  $: if (openToken !== lastOpenToken) {
    lastOpenToken = openToken;
    selectedIndex = 0;
    overrideUrl = '';
    overrideMode = null;
    visible = true;
    minimized = false;
    clampLayout();
  }
  $: if (sources.length > 0 && selectedIndex >= sources.length) {
    selectedIndex = 0;
  }

  function resolveMode(
    forcedMode: 'video' | 'embed' | 'external' | null,
    source: StreamSource | null,
    url: string
  ): 'video' | 'embed' | 'external' {
    if (forcedMode) return forcedMode;
    if (source?.mode === 'video') return 'video';
    if (source?.mode === 'embed') return 'embed';
    if (source?.mode === 'external') return 'external';
    const lower = (url || '').toLowerCase();
    if (
      lower.endsWith('.mp4') ||
      lower.endsWith('.m3u8') ||
      lower.endsWith('.webm') ||
      lower.endsWith('.ogg') ||
      lower.includes('.mp4?') ||
      lower.includes('.m3u8?')
    ) {
      return 'video';
    }
    return 'embed';
  }

  function isHlsUrl(url: string): boolean {
    const lower = (url || '').toLowerCase();
    return lower.endsWith('.m3u8') || lower.includes('.m3u8?');
  }

  function readBufferedEnd(video: HTMLVideoElement | null): number {
    if (!video) return 0;
    const ranges = video.buffered;
    if (!ranges || ranges.length === 0) return 0;
    return ranges.end(ranges.length - 1);
  }

  function pushDiagnostic(tag: string, payload?: Record<string, unknown>): void {
    const ts = new Date().toLocaleTimeString();
    const line = payload ? `${ts} ${tag} ${JSON.stringify(payload)}` : `${ts} ${tag}`;
    diagnosticsLog = [line, ...diagnosticsLog].slice(0, 80);
  }

  function detachHls(): void {
    stopStallWatchdog();
    if (hls) {
      hls.destroy();
      hls = null;
    }
    detachVideoDiagnostics();
  }

  function startStallWatchdog(): void {
    if (!videoEl) return;
    stopStallWatchdog();
    lastKnownCurrentTime = videoEl.currentTime || 0;
    stalledTicks = 0;
    stallWatchdog = setInterval(() => {
      if (!videoEl || activeMode !== 'video') return;
      if (videoEl.paused) return;
      const t = videoEl.currentTime || 0;
      if (t > lastKnownCurrentTime + 0.01) {
        lastKnownCurrentTime = t;
        stalledTicks = 0;
        return;
      }
      stalledTicks += 1;
      if (stalledTicks < 3) return;
      pushDiagnostic('watchdog.stalled', {
        currentTime: Number(t.toFixed(3)),
        readyState: videoEl.readyState,
        networkState: videoEl.networkState
      });
      console.warn('[stream][watchdog] playback stalled, attempting recovery', {
        currentTime: t,
        readyState: videoEl.readyState,
        networkState: videoEl.networkState
      });
      stalledTicks = 0;
      if (hls) {
        hls.startLoad();
      } else {
        try {
          videoEl.load();
          void videoEl.play().catch(() => {});
        } catch {}
      }
    }, 3000);
  }

  function stopStallWatchdog(): void {
    if (stallWatchdog) {
      clearInterval(stallWatchdog);
      stallWatchdog = null;
    }
    stalledTicks = 0;
  }

  function startDiagnosticsTicker(): void {
    if (!videoEl) return;
    stopDiagnosticsTicker();
    diagnosticsTicker = setInterval(() => {
      if (!videoEl) return;
      diagnosticsState = {
        ...diagnosticsState,
        currentTime: videoEl.currentTime || 0,
        duration: Number.isFinite(videoEl.duration) ? videoEl.duration : 0,
        bufferedEnd: readBufferedEnd(videoEl),
        readyState: videoEl.readyState,
        networkState: videoEl.networkState,
        paused: videoEl.paused,
        ended: videoEl.ended,
        hlsLiveSyncPosition: hls?.liveSyncPosition ?? null
      };
    }, 1000);
  }

  function stopDiagnosticsTicker(): void {
    if (diagnosticsTicker) {
      clearInterval(diagnosticsTicker);
      diagnosticsTicker = null;
    }
  }

  function attachVideoDiagnostics(): void {
    if (!videoEl) return;
    if (videoDiagAttachedTo === videoEl) return;
    detachVideoDiagnostics();

    onVideoError = () => {
      const err = videoEl?.error;
      pushDiagnostic('video.error', { code: err?.code ?? null, message: err?.message ?? null });
      console.error('[stream][video] error', {
        code: err?.code ?? null,
        message: err?.message ?? null,
        networkState: videoEl?.networkState ?? null,
        readyState: videoEl?.readyState ?? null,
        currentSrc: videoEl?.currentSrc ?? null
      });
    };
    onVideoStalled = () => {
      pushDiagnostic('video.stalled', { currentTime: videoEl?.currentTime ?? null });
      console.warn('[stream][video] stalled', {
        currentTime: videoEl?.currentTime ?? null,
        readyState: videoEl?.readyState ?? null
      });
    };
    onVideoWaiting = () => {
      pushDiagnostic('video.waiting', { currentTime: videoEl?.currentTime ?? null });
      console.warn('[stream][video] waiting', {
        currentTime: videoEl?.currentTime ?? null,
        readyState: videoEl?.readyState ?? null
      });
    };
    onVideoLoadedMeta = () => {
      pushDiagnostic('video.loadedmetadata', { duration: videoEl?.duration ?? null });
      console.log('[stream][video] loadedmetadata', {
        duration: videoEl?.duration ?? null,
        currentSrc: videoEl?.currentSrc ?? null
      });
    };
    onVideoCanPlay = () => {
      pushDiagnostic('video.canplay', { readyState: videoEl?.readyState ?? null });
      console.log('[stream][video] canplay', {
        readyState: videoEl?.readyState ?? null
      });
    };
    onVideoPlaying = () => {
      pushDiagnostic('video.playing', { currentTime: videoEl?.currentTime ?? null });
      console.log('[stream][video] playing', {
        currentTime: videoEl?.currentTime ?? null
      });
    };
    onVideoPause = () => {
      const now = Date.now();
      const elapsed = now - sourceAttachedAtMs;
      const currentTime = videoEl?.currentTime ?? 0;
      const ended = Boolean(videoEl?.ended);
      pushDiagnostic('video.pause', { currentTime, elapsedMsSinceAttach: elapsed, ended });
      console.warn('[stream][video] pause', {
        currentTime,
        ended,
        elapsedMsSinceAttach: elapsed,
        readyState: videoEl?.readyState ?? null
      });
      // If stream pauses early without ending, attempt recovery.
      if (activeMode !== 'video' || ended) return;
      if (elapsed > 2 * 60 * 1000) return;
      if (now - lastAutoRecoverAtMs < 3000) return;
      lastAutoRecoverAtMs = now;
      setTimeout(() => {
        if (!videoEl || activeMode !== 'video') return;
        if (hls) hls.startLoad();
        void videoEl.play().then(() => {
          console.log('[stream][video] auto-resume after pause succeeded');
        }).catch((error) => {
          console.warn('[stream][video] auto-resume after pause failed', error);
        });
      }, 250);
    };
    onVideoEnded = () => {
      const now = Date.now();
      const elapsed = now - sourceAttachedAtMs;
      const currentTime = videoEl?.currentTime ?? 0;
      pushDiagnostic('video.ended', { currentTime, elapsedMsSinceAttach: elapsed });
      console.warn('[stream][video] ended', { currentTime, elapsedMsSinceAttach: elapsed });
      // Unexpectedly short "ended" often means live playlist looked finite; try resume.
      if (activeMode !== 'video') return;
      if (elapsed > 2 * 60 * 1000) return;
      if (now - lastAutoRecoverAtMs < 3000) return;
      lastAutoRecoverAtMs = now;
      setTimeout(() => {
        if (!videoEl || activeMode !== 'video') return;
        if (hls) hls.startLoad();
        try {
          videoEl.currentTime = Math.max(0, (videoEl.duration || 0) - 0.5);
        } catch {}
        void videoEl.play().then(() => {
          console.log('[stream][video] auto-resume after ended succeeded');
        }).catch((error) => {
          console.warn('[stream][video] auto-resume after ended failed', error);
        });
      }, 250);
    };
    onVideoTimeUpdate = () => {
      diagnosticsState = {
        ...diagnosticsState,
        currentTime: videoEl?.currentTime || 0,
        bufferedEnd: readBufferedEnd(videoEl ?? null)
      };
    };
    onVideoProgress = () => {
      diagnosticsState = {
        ...diagnosticsState,
        bufferedEnd: readBufferedEnd(videoEl ?? null),
        networkState: videoEl?.networkState ?? 0
      };
    };

    videoEl.addEventListener('error', onVideoError);
    videoEl.addEventListener('stalled', onVideoStalled);
    videoEl.addEventListener('waiting', onVideoWaiting);
    videoEl.addEventListener('loadedmetadata', onVideoLoadedMeta);
    videoEl.addEventListener('canplay', onVideoCanPlay);
    videoEl.addEventListener('playing', onVideoPlaying);
    videoEl.addEventListener('pause', onVideoPause);
    videoEl.addEventListener('ended', onVideoEnded);
    videoEl.addEventListener('timeupdate', onVideoTimeUpdate);
    videoEl.addEventListener('progress', onVideoProgress);
    videoDiagAttachedTo = videoEl;
    startDiagnosticsTicker();
  }

  function detachVideoDiagnostics(): void {
    if (!videoDiagAttachedTo) return;
    if (onVideoError) videoDiagAttachedTo.removeEventListener('error', onVideoError);
    if (onVideoStalled) videoDiagAttachedTo.removeEventListener('stalled', onVideoStalled);
    if (onVideoWaiting) videoDiagAttachedTo.removeEventListener('waiting', onVideoWaiting);
    if (onVideoLoadedMeta) videoDiagAttachedTo.removeEventListener('loadedmetadata', onVideoLoadedMeta);
    if (onVideoCanPlay) videoDiagAttachedTo.removeEventListener('canplay', onVideoCanPlay);
    if (onVideoPlaying) videoDiagAttachedTo.removeEventListener('playing', onVideoPlaying);
    if (onVideoPause) videoDiagAttachedTo.removeEventListener('pause', onVideoPause);
    if (onVideoEnded) videoDiagAttachedTo.removeEventListener('ended', onVideoEnded);
    if (onVideoTimeUpdate) videoDiagAttachedTo.removeEventListener('timeupdate', onVideoTimeUpdate);
    if (onVideoProgress) videoDiagAttachedTo.removeEventListener('progress', onVideoProgress);
    videoDiagAttachedTo = null;
    onVideoError = null;
    onVideoStalled = null;
    onVideoWaiting = null;
    onVideoLoadedMeta = null;
    onVideoCanPlay = null;
    onVideoPlaying = null;
    onVideoPause = null;
    onVideoEnded = null;
    onVideoTimeUpdate = null;
    onVideoProgress = null;
    stopDiagnosticsTicker();
  }

  async function attachVideoSource(): Promise<void> {
    if (!videoEl || !activeUrl) return;
    if (activeMode !== 'video') return;

    detachHls();
    attachVideoDiagnostics();
    const url = activeUrl;
    sourceAttachedAtMs = Date.now();
    lastAutoRecoverAtMs = 0;
    pushDiagnostic('overlay.attachVideoSource', { url });
    console.log('[stream][overlay] attachVideoSource', { url });

    if (isHlsUrl(url)) {
      const canPlayNativeHls = videoEl.canPlayType('application/vnd.apple.mpegurl') !== '';
      console.log('[stream][overlay] hls candidate', {
        url,
        canPlayNativeHls,
        hlsJsSupported: Hls.isSupported()
      });
      if (canPlayNativeHls) {
        pushDiagnostic('overlay.hls.native');
        console.log('[stream][overlay] using native hls');
        videoEl.src = url;
        startStallWatchdog();
        return;
      }
      if (Hls.isSupported()) {
        pushDiagnostic('overlay.hls.hlsjs');
        console.log('[stream][overlay] using hls.js');
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 90,
          liveDurationInfinity: true,
          liveSyncDurationCount: 3,
          liveMaxLatencyDurationCount: 10,
          maxLiveSyncPlaybackRate: 1.0,
          manifestLoadingMaxRetry: 8,
          levelLoadingMaxRetry: 8,
          fragLoadingMaxRetry: 8,
          appendErrorMaxRetry: 8,
          manifestLoadingRetryDelay: 1000,
          levelLoadingRetryDelay: 1000,
          fragLoadingRetryDelay: 1000
        });
        hls.on(Hls.Events.MEDIA_ATTACHED, () => {
          pushDiagnostic('hls.mediaAttached');
          console.log('[stream][hls] media attached');
        });
        hls.on(Hls.Events.MANIFEST_LOADING, (_e, data: any) => {
          pushDiagnostic('hls.manifestLoading', { url: data?.url ?? url });
          console.log('[stream][hls] manifest loading', { url: data?.url ?? url });
        });
        hls.on(Hls.Events.MANIFEST_PARSED, (_e, data: any) => {
          pushDiagnostic('hls.manifestParsed', { levels: data?.levels?.length ?? 0 });
          console.log('[stream][hls] manifest parsed', {
            levels: data?.levels?.length ?? 0,
            audioTracks: data?.audioTracks?.length ?? 0,
            firstLevel: data?.firstLevel ?? null
          });
        });
        hls.on(Hls.Events.LEVEL_LOADED, (_e, data: any) => {
          console.log('[stream][hls] level loaded', {
            level: data?.level ?? null,
            totalDuration: data?.details?.totalduration ?? null,
            fragments: data?.details?.fragments?.length ?? null
          });
        });
        hls.on(Hls.Events.LEVEL_UPDATED, (_e, data: any) => {
          pushDiagnostic('hls.levelUpdated', { live: data?.details?.live ?? null, endSN: data?.details?.endSN ?? null });
          console.log('[stream][hls] level updated', {
            level: data?.level ?? null,
            live: data?.details?.live ?? null,
            endSN: data?.details?.endSN ?? null,
            startSN: data?.details?.startSN ?? null,
            ageHeader: data?.details?.ageHeader ?? null,
            totalDuration: data?.details?.totalduration ?? null
          });
        });
        hls.on(Hls.Events.FRAG_LOADED, (_e, data: any) => {
          console.log('[stream][hls] fragment loaded', {
            level: data?.frag?.level ?? null,
            sn: data?.frag?.sn ?? null,
            duration: data?.frag?.duration ?? null
          });
        });
        hls.on(Hls.Events.ERROR, (_e, data: any) => {
          pushDiagnostic('hls.error', { type: data?.type ?? null, details: data?.details ?? null, fatal: data?.fatal ?? null, code: data?.response?.code ?? null });
          console.error('[stream][hls] error', {
            type: data?.type ?? null,
            details: data?.details ?? null,
            fatal: data?.fatal ?? null,
            responseCode: data?.response?.code ?? null,
            responseText: data?.response?.text ?? null,
            url: data?.context?.url ?? data?.url ?? null
          });
          if (!data?.fatal) return;
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            console.warn('[stream][hls] fatal network error -> startLoad()');
            hls?.startLoad();
            return;
          }
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            console.warn('[stream][hls] fatal media error -> recoverMediaError()');
            hls?.recoverMediaError();
            return;
          }
          console.error('[stream][hls] unrecoverable fatal error -> destroy()');
          detachHls();
        });
        hls.loadSource(url);
        hls.attachMedia(videoEl);
        startStallWatchdog();
        return;
      }
      console.error('[stream][overlay] no native hls and hls.js unsupported');
    }

    videoEl.src = url;
    startStallWatchdog();
  }

  function clampLayout(): void {
    if (typeof window === 'undefined') return;
    if (mobileLocked) {
      const maxW = Math.max(220, window.innerWidth - (EDGE_PAD * 2));
      width = Math.min(420, maxW);
      height = Math.max(146, Math.round(width / ASPECT));
      const panelWidth = minimized ? 220 : width;
      const panelHeight = minimized ? 42 : height;
      const maxX = Math.max(EDGE_PAD, window.innerWidth - panelWidth - EDGE_PAD);
      const maxY = Math.max(EDGE_PAD, window.innerHeight - panelHeight - EDGE_PAD);
      x = Math.max(EDGE_PAD, Math.min(maxX, x));
      y = Math.max(EDGE_PAD, Math.min(maxY, y));
      return;
    }

    const maxW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth - (EDGE_PAD * 2)));
    width = Math.max(MIN_WIDTH, Math.min(maxW, width));
    height = Math.max(146, Math.round(width / ASPECT));

    const panelWidth = minimized ? 220 : width;
    const panelHeight = minimized ? 42 : (height + 42);
    const maxX = Math.max(EDGE_PAD, window.innerWidth - panelWidth - EDGE_PAD);
    const maxY = Math.max(EDGE_PAD, window.innerHeight - panelHeight - EDGE_PAD);
    x = Math.max(EDGE_PAD, Math.min(maxX, x));
    y = Math.max(EDGE_PAD, Math.min(maxY, y));
  }

  function persist(): void {
    if (typeof localStorage === 'undefined') return;
    try {
      // Intentionally do not persist `visible` so player does not auto-open on mount.
      localStorage.setItem(storageKey, JSON.stringify({ minimized, muted, x, y, width, selectedIndex }));
    } catch {}
  }

  function restore(): void {
    if (typeof window === 'undefined') return;
    if (typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) {
        x = Math.max(EDGE_PAD, window.innerWidth - width - 16);
        y = Math.max(EDGE_PAD, window.innerHeight - (height + 42) - 16);
        return;
      }
      const parsed = JSON.parse(raw) as {
        minimized?: boolean;
        muted?: boolean;
        x?: number;
        y?: number;
        width?: number;
        selectedIndex?: number;
      };
      visible = false;
      minimized = parsed.minimized ?? minimized;
      muted = parsed.muted ?? muted;
      x = Number.isFinite(parsed.x) ? Number(parsed.x) : x;
      y = Number.isFinite(parsed.y) ? Number(parsed.y) : y;
      width = Number.isFinite(parsed.width) ? Number(parsed.width) : width;
      if (Number.isFinite(parsed.selectedIndex)) {
        selectedIndex = Math.max(0, Math.min(sources.length - 1, Number(parsed.selectedIndex)));
      }
      clampLayout();
    } catch {}
  }

  function beginDrag(event: PointerEvent): void {
    if (mobileLocked) return;
    if (!visible) return;
    dragging = true;
    startPointerX = event.clientX;
    startPointerY = event.clientY;
    startX = x;
    startY = y;
  }

  function beginResize(event: PointerEvent): void {
    if (mobileLocked) return;
    if (!visible || minimized) return;
    event.stopPropagation();
    resizing = true;
    startPointerX = event.clientX;
    startPointerY = event.clientY;
    startWidth = width;
    startHeight = height;
  }

  function beginSurfaceDrag(event: PointerEvent): void {
    if (!visible || minimized) return;
    if (event.button !== 0) return;
    dragCandidate = true;
    startPointerX = event.clientX;
    startPointerY = event.clientY;
    startX = x;
    startY = y;
  }

  function beginSurfaceTouchDrag(event: TouchEvent): void {
    if (!visible || minimized) return;
    if (!event.touches?.length) return;
    const touch = event.touches[0];
    dragCandidate = true;
    startPointerX = touch.clientX;
    startPointerY = touch.clientY;
    startX = x;
    startY = y;
  }

  function beginDragFromHandle(event: PointerEvent): void {
    event.stopPropagation();
    beginSurfaceDrag(event);
  }

  function beginTouchDragFromHandle(event: TouchEvent): void {
    event.stopPropagation();
    beginSurfaceTouchDrag(event);
  }

  function finishInteraction(): void {
    if (!dragging && !resizing && !dragCandidate) return;
    dragging = false;
    resizing = false;
    dragCandidate = false;
    persist();
  }

  function handlePointerMove(event: PointerEvent): void {
    if (dragCandidate && !dragging && !resizing) {
      const dx = event.clientX - startPointerX;
      const dy = event.clientY - startPointerY;
      if (Math.abs(dx) + Math.abs(dy) > 6) {
        dragging = true;
      }
    }

    if (dragging) {
      x = startX + (event.clientX - startPointerX);
      y = startY + (event.clientY - startPointerY);
      clampLayout();
      return;
    }

    if (resizing) {
      const deltaX = event.clientX - startPointerX;
      const nextWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + deltaX));
      width = nextWidth;
      height = Math.max(146, Math.round(nextWidth / ASPECT));
      clampLayout();
    }
  }

  function handleTouchMove(event: TouchEvent): void {
    if (!event.touches?.length) return;
    if (!dragCandidate && !dragging && !resizing) return;
    const touch = event.touches[0];
    const dx = touch.clientX - startPointerX;
    const dy = touch.clientY - startPointerY;
    if (dragCandidate && !dragging && !resizing) {
      if (Math.abs(dx) + Math.abs(dy) > 6) {
        dragging = true;
      }
    }
    if (dragging) {
      x = startX + dx;
      y = startY + dy;
      clampLayout();
      event.preventDefault();
    }
  }

  function toggleVisible(): void {
    console.log('[stream][overlay] toggleVisible', { visible, activeMode, activeUrl });
    if (!visible && activeMode === 'external' && activeUrl) {
      console.log('[stream][overlay] external launch from toggleVisible', { activeUrl });
      openExternal(activeUrl);
      return;
    }
    visible = !visible;
    if (!visible) {
      overrideUrl = '';
      overrideMode = null;
    }
    if (visible) clampLayout();
    persist();
  }

  function openDefaultOverlay(): void {
    overrideUrl = '';
    overrideMode = null;
    toggleVisible();
  }

  function openSecondaryIframeOverlay(): void {
    if (!secondaryIframeUrl) return;
    overrideUrl = secondaryIframeUrl;
    overrideMode = 'embed';
    visible = true;
    minimized = false;
    clampLayout();
    persist();
  }

  function openSecondaryExternalWindow(): void {
    if (!secondaryExternalUrl) return;
    window.open(secondaryExternalUrl, '_blank', 'noopener,noreferrer');
  }

  function toggleMinimized(): void {
    minimized = !minimized;
    clampLayout();
    persist();
  }

  function toggleMuted(): void {
    muted = !muted;
    persist();
  }

  async function enterFullscreen(): Promise<void> {
    const target = videoEl ?? rootEl;
    if (!target) return;
    if (!('requestFullscreen' in target)) return;
    try {
      await target.requestFullscreen();
    } catch {}
  }

  async function togglePictureInPicture(): Promise<void> {
    if (activeMode !== 'video') return;
    if (!videoEl) return;
    if (!('pictureInPictureEnabled' in document)) return;

    try {
      if (document.pictureInPictureElement === videoEl) {
        await document.exitPictureInPicture();
      } else {
        await videoEl.requestPictureInPicture();
      }
    } catch {}
  }

  function extractYouTubeVideoId(url: string): string {
    try {
      const parsed = new URL(url);
      const host = parsed.hostname.toLowerCase();
      if (host.includes('youtu.be')) {
        const idFromPath = parsed.pathname.replace(/^\/+/, '').split('/')[0];
        return idFromPath || '';
      }
      if (host.includes('youtube.com')) {
        if (parsed.pathname === '/watch') return parsed.searchParams.get('v') || '';
        const parts = parsed.pathname.split('/').filter(Boolean);
        const embedIndex = parts.findIndex((p) => p === 'embed' || p === 'shorts');
        if (embedIndex >= 0 && parts[embedIndex + 1]) return parts[embedIndex + 1];
      }
      return '';
    } catch {
      return '';
    }
  }

  function shouldAttemptYouTubeAppDeepLink(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /Android|iPhone|iPad|iPod/i.test(ua);
  }

  function isMobileDevice(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /Android|iPhone|iPad|iPod/i.test(ua);
  }

  function tryOpenInFirefox(url: string): void {
    if (typeof navigator === 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }
    const ua = navigator.userAgent || '';
    const isAndroid = /Android/i.test(ua);
    const isIOS = /iPhone|iPad|iPod/i.test(ua);

    if (isAndroid) {
      try {
        const parsed = new URL(url);
        const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
        const intentUrl =
          `intent://${parsed.host}${path}` +
          `#Intent;scheme=${parsed.protocol.replace(':', '')};package=org.mozilla.firefox;` +
          `S.browser_fallback_url=${encodeURIComponent(url)};end`;
        window.location.href = intentUrl;
      } catch {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    if (isIOS) {
      const firefoxUrl = `firefox://open-url?url=${encodeURIComponent(url)}`;
      window.location.href = firefoxUrl;
      setTimeout(() => {
        if (typeof document === 'undefined' || !document.hidden) {
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      }, 500);
      return;
    }

    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function openExternal(url: string): void {
    console.log('[stream][overlay] openExternal start', { url, isMobile: isMobileDevice() });
    if (!url) return;
    const id = extractYouTubeVideoId(url);
    if (!id) {
      console.log('[stream][overlay] openExternal non-youtube');
      if (isMobileDevice()) {
        console.log('[stream][overlay] trying firefox');
        tryOpenInFirefox(url);
        return;
      }
      console.log('[stream][overlay] opening new tab (web non-youtube)');
      window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    const webUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;
    if (!shouldAttemptYouTubeAppDeepLink()) {
      console.log('[stream][overlay] youtube web open new tab', { webUrl });
      window.open(webUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const appUrl = `youtube://watch?v=${encodeURIComponent(id)}`;
    const wasHiddenAtStart = typeof document !== 'undefined' ? document.hidden : false;
    window.location.href = appUrl;

    // Fallback to web only if app deep-link did not background this page.
    setTimeout(() => {
      const stillVisible = typeof document !== 'undefined' ? !document.hidden : true;
      if (!wasHiddenAtStart && stillVisible) {
        window.location.assign(webUrl);
      }
    }, 500);
  }

  function popOut(): void {
    if (!activeUrl) return;
    if (activeMode === 'external') {
      openExternal(activeUrl);
      return;
    }
    window.open(activeUrl, '_blank', 'noopener,noreferrer,width=1200,height=760');
  }

  function handleSourceChange(nextIndex: number): void {
    selectedIndex = nextIndex;
    overrideUrl = '';
    overrideMode = null;
    persist();
    const next = sources[nextIndex];
    if (next?.mode === 'external' && next.url) {
      openExternal(next.url);
    }
  }

  onMount(() => {
    const refreshMobileLock = () => {
      if (typeof window === 'undefined') return;
      const wasMobileLocked = mobileLocked;
      mobileLocked = window.matchMedia('(max-width: 900px), (pointer: coarse)').matches;
      if (mobileLocked) {
        minimized = false;
        muted = false;
        if (!wasMobileLocked) {
          const maxW = Math.max(220, window.innerWidth - (EDGE_PAD * 2));
          width = Math.min(420, maxW);
          height = Math.max(146, Math.round(width / ASPECT));
          x = Math.max(EDGE_PAD, window.innerWidth - width - EDGE_PAD);
          y = Math.max(EDGE_PAD, window.innerHeight - height - EDGE_PAD);
        }
      }
      clampLayout();
    };

    restore();
    refreshMobileLock();
    clampLayout();
    const onResize = () => {
      refreshMobileLock();
      clampLayout();
      persist();
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishInteraction);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', finishInteraction);
    window.addEventListener('touchcancel', finishInteraction);
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishInteraction);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', finishInteraction);
      window.removeEventListener('touchcancel', finishInteraction);
      window.removeEventListener('resize', onResize);
    };
  });

  onDestroy(() => {
    detachHls();
    detachVideoDiagnostics();
    stopStallWatchdog();
    stopDiagnosticsTicker();
    persist();
  });
</script>

{#if visible}
  <div
    bind:this={rootEl}
    class="fixed z-50 overflow-hidden rounded-md border border-white/20 bg-black/95 shadow-xl backdrop-blur-sm"
    style="left: {x}px; top: {y}px; width: {minimized ? 220 : width}px;"
  >
    {#if !mobileLocked}
    <div class="flex items-center gap-2 border-b border-white/15 px-2 py-1.5 text-xs">
      <button type="button" class="cursor-move text-white/75 hover:text-white" on:pointerdown={beginDrag} title="Drag player">
        Move
      </button>
      <span class="truncate text-white/70">{titleText}</span>
      <div class="ml-auto flex items-center gap-1">
        {#if sources.length > 1}
          <select
            class="max-w-[120px] rounded border border-white/20 bg-black/80 px-1 py-0.5 text-[11px]"
            value={selectedIndex}
            on:change={(event) => handleSourceChange(Number((event.currentTarget as HTMLSelectElement).value))}
          >
            {#each sources as source, i}
              <option value={i}>{source.label}</option>
            {/each}
          </select>
        {/if}
        <button type="button" class="rounded px-1.5 py-0.5 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed" on:click={toggleMuted} title="Mute / unmute" disabled={activeMode === 'external'}>
          {muted ? 'Unmute' : 'Mute'}
        </button>
        <button type="button" class="rounded px-1.5 py-0.5 text-white/70 hover:bg-white/10 hover:text-white" on:click={toggleMinimized} title="Minimize">
          {minimized ? 'Expand' : 'Min'}
        </button>
        <button type="button" class="rounded px-1.5 py-0.5 text-white/70 hover:bg-white/10 hover:text-white" on:click={() => (showDiagnostics = !showDiagnostics)} title="Diagnostics">
          Diag
        </button>
        <button type="button" class="rounded px-1.5 py-0.5 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed" on:click={enterFullscreen} title="Fullscreen" disabled={activeMode === 'external'}>
          Full
        </button>
        <button type="button" class="rounded px-1.5 py-0.5 text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed" on:click={togglePictureInPicture} title={activeMode === 'video' ? 'Picture in picture' : 'PiP unavailable for embedded pages'} disabled={activeMode !== 'video'}>
          PiP
        </button>
        <button type="button" class="rounded px-1.5 py-0.5 text-white/70 hover:bg-white/10 hover:text-white" on:click={popOut} title="Pop out player">
          Pop
        </button>
        <button type="button" class="rounded px-1.5 py-0.5 text-white/70 hover:bg-white/10 hover:text-white" on:click={toggleVisible} title="Close player">
          X
        </button>
      </div>
    </div>
    {/if}

    {#if !minimized}
      <div
        class="relative bg-black touch-none"
        style="height: {height}px;"
        on:pointerdown={beginSurfaceDrag}
        on:touchstart={beginSurfaceTouchDrag}
        role="presentation"
        tabindex="-1"
        aria-hidden="true"
      >
        {#if activeUrl}
          {#if activeMode === 'video'}
            <video
              bind:this={videoEl}
              class="h-full w-full bg-black"
              controls
              autoplay
              playsinline
              {muted}
            ></video>
          {:else}
            {#if activeMode === 'external'}
              <div class="flex h-full w-full items-center justify-center p-4 text-center">
                <button
                  type="button"
                  class="rounded border border-white/20 bg-white/10 px-4 py-2 text-sm text-white/90 hover:bg-white/15"
                  on:click={() => openExternal(activeUrl)}
                >
                  Open In YouTube
                </button>
              </div>
            {:else}
              <iframe
                src={activeUrl}
                class="h-full w-full bg-black"
                title={titleText}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
              ></iframe>
            {/if}
          {/if}
        {:else}
          <div class="flex h-full items-center justify-center text-sm text-white/60">No stream URL configured</div>
        {/if}
        {#if mobileLocked}
          <div class="absolute right-1 top-1 z-10 flex items-center gap-1">
            <button
              type="button"
              class="rounded border border-white/20 bg-black/70 px-2 py-0.5 text-[11px] text-white/85"
              on:pointerdown={beginDragFromHandle}
              on:touchstart={beginTouchDragFromHandle}
              title="Drag player"
            >
              Drag
            </button>
            <button
              type="button"
              class="rounded border border-white/20 bg-black/70 px-1.5 py-0.5 text-[11px] text-white/85"
              on:click={toggleVisible}
              title="Close player"
            >
              X
            </button>
          </div>
        {:else}
          <button
            type="button"
            class="absolute bottom-1 right-1 h-4 w-4 cursor-se-resize rounded-sm border border-white/30 bg-black/80 text-[10px] text-white/70"
            on:pointerdown={beginResize}
            title="Resize player"
          >
            +
          </button>
        {/if}
        {#if showDiagnostics && activeMode === 'video'}
          <div class="absolute left-1 top-1 z-20 max-h-[75%] w-[88%] overflow-auto rounded border border-white/20 bg-black/85 p-2 text-[10px] text-white/80">
            <div class="mb-1 font-semibold text-white/90">Diagnostics</div>
            <div class="mb-1">
              t={diagnosticsState.currentTime.toFixed(2)}s dur={diagnosticsState.duration.toFixed(2)}s bufEnd={diagnosticsState.bufferedEnd.toFixed(2)}s
            </div>
            <div class="mb-1">
              ready={diagnosticsState.readyState} net={diagnosticsState.networkState} paused={diagnosticsState.paused ? '1' : '0'} ended={diagnosticsState.ended ? '1' : '0'}
            </div>
            <div class="mb-2">
              liveSync={diagnosticsState.hlsLiveSyncPosition === null ? 'n/a' : diagnosticsState.hlsLiveSyncPosition.toFixed(2)}
            </div>
            {#each diagnosticsLog as line, i (`diag-${i}`)}
              <div class="whitespace-pre-wrap break-all">{line}</div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{:else if showClosedButton}
  <div class="fixed bottom-3 right-3 z-50 flex items-center gap-2">
    {#if secondaryExternalUrl}
      <button
        type="button"
        class="rounded border border-white/20 bg-black/90 px-3 py-1.5 text-xs text-white/80 hover:text-white"
        on:click={openSecondaryExternalWindow}
      >
        {secondaryExternalLabel || 'Open Window'}
      </button>
    {/if}
    {#if secondaryIframeUrl}
      <button
        type="button"
        class="rounded border border-white/20 bg-black/90 px-3 py-1.5 text-xs text-white/80 hover:text-white"
        on:click={openSecondaryIframeOverlay}
      >
        {secondaryButtonLabel || 'Open Iframe'}
      </button>
    {/if}
    <button
      type="button"
      class="rounded border border-white/20 bg-black/90 px-3 py-1.5 text-xs text-white/80 hover:text-white"
      on:click={openDefaultOverlay}
    >
      {closedButtonLabel}
    </button>
  </div>
{/if}

