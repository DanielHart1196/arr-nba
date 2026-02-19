<script lang="ts">
  import { onMount } from 'svelte';
  import { dev } from '$app/environment';
  import '../app.css';
  let menuOpen = false;

  onMount(() => {
    if (dev) return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/service-worker.js', { type: 'module' }).catch((error) => {
      console.warn('Service worker registration failed:', error);
    });
  });
</script>

<div class="min-h-screen bg-black text-white overflow-x-hidden">
  <div class="fixed top-3 left-3 z-50">
    <button
      type="button"
      aria-label="Open menu"
      class="rounded border border-white/20 bg-black/70 px-2 py-1 text-lg leading-none"
      on:click={() => (menuOpen = !menuOpen)}
    >
      &#9776;
    </button>

    {#if menuOpen}
      <div class="mt-2 min-w-[180px] rounded border border-white/20 bg-black/95 p-2 shadow-lg">
        <button class="block w-full rounded px-2 py-2 text-left text-sm hover:bg-white/10">Placeholder Item 1</button>
        <button class="block w-full rounded px-2 py-2 text-left text-sm hover:bg-white/10">Placeholder Item 2</button>
        <button class="block w-full rounded px-2 py-2 text-left text-sm hover:bg-white/10">Placeholder Item 3</button>
      </div>
    {/if}
  </div>

  <slot />
</div>
