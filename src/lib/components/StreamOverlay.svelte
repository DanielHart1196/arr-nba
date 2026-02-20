<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  type StreamSource = { label: string; url: string; mode?: 'auto' | 'video' | 'embed' };

  export let title = 'Live Stream';
  export let streamUrl = '';
  export let sources: StreamSource[] = [];
  export let storageKey = 'arrnba.streamOverlay.v1';

  let rootEl: HTMLDivElement | null = null;
  let videoEl: HTMLVideoElement | null = null;

  let visible = true;
  let minimized = false;
  let muted = true;
  let selectedIndex = 0;

  let x = 16;
  let y = 16;
  let width = 380;
  let height = 214;

  let dragging = false;
  let resizing = false;
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
  $: activeUrl = selectedSource?.url || streamUrl;
  $: titleText = selectedSource ? `${title} - ${selectedSource.label}` : title;
  $: activeMode = resolveMode(selectedSource, activeUrl);

  function resolveMode(source: StreamSource | null, url: string): 'video' | 'embed' {
    if (source?.mode === 'video') return 'video';
    if (source?.mode === 'embed') return 'embed';
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

  function clampLayout(): void {
    if (typeof window === 'undefined') return;

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
      localStorage.setItem(storageKey, JSON.stringify({ visible, minimized, muted, x, y, width, selectedIndex }));
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
        visible?: boolean;
        minimized?: boolean;
        muted?: boolean;
        x?: number;
        y?: number;
        width?: number;
        selectedIndex?: number;
      };
      visible = parsed.visible ?? visible;
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
    if (!visible) return;
    dragging = true;
    startPointerX = event.clientX;
    startPointerY = event.clientY;
    startX = x;
    startY = y;
  }

  function beginResize(event: PointerEvent): void {
    if (!visible || minimized) return;
    event.stopPropagation();
    resizing = true;
    startPointerX = event.clientX;
    startPointerY = event.clientY;
    startWidth = width;
    startHeight = height;
  }

  function finishInteraction(): void {
    if (!dragging && !resizing) return;
    dragging = false;
    resizing = false;
    persist();
  }

  function handlePointerMove(event: PointerEvent): void {
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

  function toggleVisible(): void {
    visible = !visible;
    if (visible) clampLayout();
    persist();
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

  function popOut(): void {
    if (!activeUrl) return;
    window.open(activeUrl, '_blank', 'noopener,noreferrer,width=1200,height=760');
  }

  function handleSourceChange(nextIndex: number): void {
    selectedIndex = nextIndex;
    persist();
  }

  onMount(() => {
    restore();
    clampLayout();
    const onResize = () => {
      clampLayout();
      persist();
    };
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishInteraction);
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishInteraction);
      window.removeEventListener('resize', onResize);
    };
  });

  onDestroy(() => {
    persist();
  });
</script>

{#if visible}
  <div
    bind:this={rootEl}
    class="fixed z-50 overflow-hidden rounded-md border border-white/20 bg-black/95 shadow-xl backdrop-blur-sm"
    style="left: {x}px; top: {y}px; width: {minimized ? 220 : width}px;"
  >
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
        <button type="button" class="rounded px-1.5 py-0.5 text-white/70 hover:bg-white/10 hover:text-white" on:click={toggleMuted} title="Mute / unmute">
          {muted ? 'Unmute' : 'Mute'}
        </button>
        <button type="button" class="rounded px-1.5 py-0.5 text-white/70 hover:bg-white/10 hover:text-white" on:click={toggleMinimized} title="Minimize">
          {minimized ? 'Expand' : 'Min'}
        </button>
        <button type="button" class="rounded px-1.5 py-0.5 text-white/70 hover:bg-white/10 hover:text-white" on:click={enterFullscreen} title="Fullscreen">
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

    {#if !minimized}
      <div class="relative bg-black" style="height: {height}px;">
        {#if activeUrl}
          {#if activeMode === 'video'}
            <video
              bind:this={videoEl}
              src={activeUrl}
              class="h-full w-full bg-black"
              controls
              autoplay
              playsinline
              {muted}
            ></video>
          {:else}
            <iframe
              src={activeUrl}
              class="h-full w-full bg-black"
              title={titleText}
              allow="autoplay; fullscreen; picture-in-picture"
              referrerpolicy="no-referrer"
              allowfullscreen
            ></iframe>
          {/if}
        {:else}
          <div class="flex h-full items-center justify-center text-sm text-white/60">No stream URL configured</div>
        {/if}
        <button
          type="button"
          class="absolute bottom-1 right-1 h-4 w-4 cursor-se-resize rounded-sm border border-white/30 bg-black/80 text-[10px] text-white/70"
          on:pointerdown={beginResize}
          title="Resize player"
        >
          ◢
        </button>
      </div>
    {/if}
  </div>
{:else}
  <button
    type="button"
    class="fixed bottom-3 right-3 z-50 rounded border border-white/20 bg-black/90 px-3 py-1.5 text-xs text-white/80 hover:text-white"
    on:click={toggleVisible}
  >
    Open Stream
  </button>
{/if}
