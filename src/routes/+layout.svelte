<script lang="ts">
  import { onMount } from 'svelte';
  import { dev } from '$app/environment';
  import '../app.css';

  onMount(() => {
    if (dev) return;
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/service-worker.js', { type: 'module' }).catch((error) => {
      console.warn('Service worker registration failed:', error);
    });
  });
</script>

<div class="min-h-screen bg-black text-white overflow-x-hidden">
  <slot />
</div>
