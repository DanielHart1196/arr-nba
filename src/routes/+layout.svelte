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
  let lastError: string | null = null;

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
    const onError = (event: ErrorEvent) => {
      const msg = event?.error?.stack || event?.message || 'Unknown error';
      lastError = String(msg);
    };
    const onUnhandled = (event: PromiseRejectionEvent) => {
      const reason = (event as any)?.reason;
      const msg = reason?.stack || reason?.message || reason || 'Unhandled promise rejection';
      lastError = String(msg);
    };
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
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandled);

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
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandled);
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
  {#if lastError}
    <div class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/85 p-4">
      <div class="max-w-md w-full rounded border border-red-500/40 bg-black/90 p-4 text-sm text-red-200">
        <div class="mb-2 font-semibold text-red-100">Runtime Error</div>
        <pre class="whitespace-pre-wrap break-words text-xs">{lastError}</pre>
        <button class="mt-3 rounded border border-white/15 px-2 py-1 text-xs text-white/80" on:click={() => (lastError = null)}>Dismiss</button>
      </div>
    </div>
  {/if}
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
