<script lang="ts">
  import { onDestroy } from 'svelte';

  let refreshMenuOpen = false;
  let refreshMenuEl: HTMLDivElement | null = null;
  let refreshButtonEl: HTMLButtonElement | null = null;
  let refreshMenuListenersActive = false;
  let refreshPressTimer: ReturnType<typeof setTimeout> | null = null;
  let refreshLongPressFired = false;
  let suppressRefreshClick = false;

  function clearRefreshPressTimer(): void {
    if (!refreshPressTimer) return;
    clearTimeout(refreshPressTimer);
    refreshPressTimer = null;
  }

  function closeRefreshMenu(): void {
    refreshMenuOpen = false;
    removeRefreshMenuOutsideListeners();
  }

  function handleRefreshOutsideEvent(event: Event): void {
    if (!refreshMenuOpen) return;
    const target = event.target as Node | null;
    if (refreshMenuEl && target && refreshMenuEl.contains(target)) return;
    if (refreshButtonEl && target && refreshButtonEl.contains(target)) return;
    closeRefreshMenu();
  }

  function addRefreshMenuOutsideListeners(): void {
    if (refreshMenuListenersActive || typeof window === 'undefined') return;
    refreshMenuListenersActive = true;
    window.addEventListener('pointerdown', handleRefreshOutsideEvent, { capture: true, passive: true });
    window.addEventListener('wheel', handleRefreshOutsideEvent, { capture: true, passive: true });
    window.addEventListener('touchstart', handleRefreshOutsideEvent, { capture: true, passive: true });
  }

  function removeRefreshMenuOutsideListeners(): void {
    if (!refreshMenuListenersActive || typeof window === 'undefined') return;
    refreshMenuListenersActive = false;
    window.removeEventListener('pointerdown', handleRefreshOutsideEvent, { capture: true });
    window.removeEventListener('wheel', handleRefreshOutsideEvent, { capture: true });
    window.removeEventListener('touchstart', handleRefreshOutsideEvent, { capture: true });
  }

  function requestSoftReload(): void {
    closeRefreshMenu();
    location.reload();
  }

  async function requestHardReload(): Promise<void> {
    closeRefreshMenu();
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      if (regs) await Promise.all(regs.map((reg) => reg.update()));
    } catch {}
    try {
      const url = new URL(location.href);
      url.searchParams.set('arrnba_hard', String(Date.now()));
      location.replace(url.toString());
    } catch {
      location.reload();
    }
  }

  async function clearCacheAndReload(): Promise<void> {
    closeRefreshMenu();
    try {
      const keys = await caches?.keys?.();
      if (Array.isArray(keys)) {
        await Promise.all(keys.map((key) => caches.delete(key)));
      }
    } catch {}
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      if (regs) await Promise.all(regs.map((reg) => reg.unregister()));
    } catch {}
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    location.reload();
  }

  function handleRefreshPointerDown(): void {
    refreshLongPressFired = false;
    suppressRefreshClick = false;
    clearRefreshPressTimer();
    refreshPressTimer = setTimeout(() => {
      refreshLongPressFired = true;
      refreshMenuOpen = true;
      addRefreshMenuOutsideListeners();
    }, 550);
  }

  function handleRefreshPointerUp(): void {
    if (!refreshPressTimer) return;
    clearRefreshPressTimer();
    if (!refreshLongPressFired) {
      suppressRefreshClick = true;
      requestSoftReload();
    }
  }

  function handleRefreshClick(event: MouseEvent): void {
    if (suppressRefreshClick) {
      suppressRefreshClick = false;
      event.preventDefault();
      return;
    }
    if (refreshLongPressFired) {
      event.preventDefault();
      return;
    }
    requestSoftReload();
  }

  onDestroy(() => {
    clearRefreshPressTimer();
    removeRefreshMenuOutsideListeners();
  });
</script>

<div class="relative flex h-7 items-center" data-no-swipe="true">
  <button
    type="button"
    aria-label="Refresh"
    class="h-7 w-7 inline-flex items-center justify-center text-white/80 hover:text-white"
    style="touch-action: manipulation;"
    bind:this={refreshButtonEl}
    on:pointerdown={handleRefreshPointerDown}
    on:pointerup={handleRefreshPointerUp}
    on:pointerleave={clearRefreshPressTimer}
    on:pointercancel={clearRefreshPressTimer}
    on:click|preventDefault={handleRefreshClick}
  >
    <svg viewBox="0 0 24 24" class="h-5 w-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 12a8 8 0 1 1-2.34-5.66"></path>
      <path d="M20 4v6h-6"></path>
    </svg>
  </button>
  {#if refreshMenuOpen}
    <div
      class="absolute left-0 top-7 z-[1000] w-52 rounded border border-white/15 bg-[#121212] shadow-lg overflow-hidden"
      bind:this={refreshMenuEl}
      data-no-swipe="true"
    >
      <button class="block w-full px-3 py-2 text-left text-sm hover:bg-white/10" on:click|preventDefault={requestHardReload}>
        Hard reload
      </button>
      <button class="block w-full px-3 py-2 text-left text-sm hover:bg-white/10 border-t border-white/10" on:click|preventDefault={clearCacheAndReload}>
        Clear cache + reload
      </button>
    </div>
  {/if}
</div>
