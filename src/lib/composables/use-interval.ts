import { onMount, onDestroy } from 'svelte';

export function useInterval(callback: () => void, delay: number | null) {
  let intervalId: NodeJS.Timeout | null = null;
  
  function start() {
    if (delay !== null && intervalId === null) {
      intervalId = setInterval(callback, delay);
    }
  }
  
  function stop() {
    if (intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }
  
  onMount(() => {
    start();
  });
  
  onDestroy(() => {
    stop();
  });
  
  return {
    start,
    stop,
    restart: () => {
      stop();
      start();
    }
  };
}
