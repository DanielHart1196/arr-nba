<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import { dev } from '$app/environment';
  import { Capacitor } from '@capacitor/core';
  import StreamOverlay from '../lib/components/StreamOverlay.svelte';
  import { streamOverlayStore } from '../lib/stores/streamOverlay.store';
  import '../app.css';

  const RESUME_RELOAD_KEY = 'arrnba.resumeReload.v1';
  const RESUME_RELOAD_WINDOW_MS = 15_000;
  let appHydrated = false;
  let resumeWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  let removeNativeBackListener: (() => void) | null = null;

  function clearResumeWatchdog(): void {
    if (!resumeWatchdogTimer) return;
    clearTimeout(resumeWatchdogTimer);
    resumeWatchdogTimer = null;
  }

  function markHydratedSoon(): void {
    appHydrated = false;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        appHydrated = true;
      });
    });
  }

  function canForceResumeReloadNow(): boolean {
    try {
      const raw = sessionStorage.getItem(RESUME_RELOAD_KEY);
      const now = Date.now();
      if (!raw) return true;
      const parsed = JSON.parse(raw) as { count?: number; startedAt?: number };
      const count = Number(parsed?.count ?? 0);
      const startedAt = Number(parsed?.startedAt ?? 0);
      if (!Number.isFinite(startedAt) || now - startedAt > RESUME_RELOAD_WINDOW_MS) return true;
      return count < 1;
    } catch {
      return true;
    }
  }

  function markForcedResumeReload(): void {
    try {
      const raw = sessionStorage.getItem(RESUME_RELOAD_KEY);
      const now = Date.now();
      const parsed = raw ? (JSON.parse(raw) as { count?: number; startedAt?: number }) : {};
      const startedAt = Number(parsed?.startedAt ?? 0);
      const withinWindow = Number.isFinite(startedAt) && now - startedAt <= RESUME_RELOAD_WINDOW_MS;
      const count = withinWindow ? Number(parsed?.count ?? 0) + 1 : 1;
      sessionStorage.setItem(RESUME_RELOAD_KEY, JSON.stringify({ count, startedAt: withinWindow ? startedAt : now }));
    } catch {}
  }

  function scheduleResumeWatchdog(source: string): void {
    clearResumeWatchdog();
    resumeWatchdogTimer = setTimeout(() => {
      if (typeof document === 'undefined') return;
      if (document.visibilityState !== 'visible') return;
      if (appHydrated) return;
      if (!canForceResumeReloadNow()) return;
      console.warn('[resume][watchdog] forcing reload after stalled resume', { source });
      markForcedResumeReload();
      location.reload();
    }, 2200);
  }

  onMount(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        markHydratedSoon();
        window.dispatchEvent(new CustomEvent('arrnba:resume', { detail: { source: 'visibilitychange' } }));
        scheduleResumeWatchdog('visibilitychange');
      } else {
        clearResumeWatchdog();
      }
    };

    const onPageShow = (event: PageTransitionEvent) => {
      markHydratedSoon();
      window.dispatchEvent(new CustomEvent('arrnba:resume', { detail: { source: 'pageshow', persisted: event.persisted } }));
      scheduleResumeWatchdog('pageshow');
    };

    markHydratedSoon();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('pageshow', onPageShow);

    if (!dev && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js', { type: 'module' }).catch((error) => {
        console.warn('Service worker registration failed:', error);
      });
    }

    if (Capacitor.isNativePlatform()) {
      void (async () => {
        try {
          const { App } = await import('@capacitor/app');
          const listener = await App.addListener('backButton', async ({ canGoBack }) => {
            if (canGoBack || window.location.pathname !== '/') {
              window.history.back();
              return;
            }
            await App.minimizeApp();
          });
          removeNativeBackListener = () => listener.remove();
        } catch (error) {
          console.warn('Native back button setup failed:', error);
        }
      })();
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('pageshow', onPageShow);
      clearResumeWatchdog();
      if (removeNativeBackListener) {
        removeNativeBackListener();
        removeNativeBackListener = null;
      }
    };
  });

  onDestroy(() => {
    clearResumeWatchdog();
    if (removeNativeBackListener) {
      removeNativeBackListener();
      removeNativeBackListener = null;
    }
  });
</script>

<div class="min-h-screen bg-black text-white overflow-x-hidden" data-arrnba-shell data-arrnba-hydrated={appHydrated ? '1' : '0'}>
  <slot />
  <StreamOverlay
    title={$streamOverlayStore.title}
    streamUrl={$streamOverlayStore.streamUrl}
    sources={$streamOverlayStore.sources}
    storageKey={$streamOverlayStore.storageKey}
    closedButtonLabel={$streamOverlayStore.closedButtonLabel}
    secondaryButtonLabel={$streamOverlayStore.secondaryButtonLabel}
    secondaryIframeUrl={$streamOverlayStore.secondaryIframeUrl}
    secondaryExternalUrl={$streamOverlayStore.secondaryExternalUrl}
    secondaryExternalLabel={$streamOverlayStore.secondaryExternalLabel}
    openToken={$streamOverlayStore.openToken}
    showClosedButton={false}
  />
</div>
