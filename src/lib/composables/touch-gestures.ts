import { onMount, onDestroy } from 'svelte';

export interface TouchGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  threshold?: number;
  preventScroll?: boolean;
  target?: HTMLElement | Document;
}

export function createTouchGestures(options: TouchGestureOptions = {}) {
  let startX = 0;
  let startY = 0;
  let isScrolling = false;
  
  const threshold = options.threshold || 50;
  const target = options.target || (typeof document !== 'undefined' ? document : null);
  
  if (!target) return { destroy: () => {} };

  function handleTouchStart(event: TouchEvent) {
    const touch = event.touches?.[0];
    if (!touch) return;
    
    startX = touch.clientX;
    startY = touch.clientY;
    isScrolling = false;

    const targetEl = event.target as HTMLElement;
    
    const isSwipeArea = !!(targetEl as any)?.closest?.('.swipe-area') || 
                        document.body.classList.contains('swipe-area') ||
                        document.documentElement.classList.contains('swipe-area');
    
    const isScrollContainer = !!(targetEl as any)?.closest?.('[data-scrollable="true"]') || 
                               !!(targetEl as any)?.closest?.('.scroll-container');

    if (isSwipeArea) {
      isScrolling = false;
    } else if (isScrollContainer) {
      isScrolling = true;
    }
  }
  
  function handleTouchEnd(event: TouchEvent) {
    const touch = event.changedTouches?.[0];
    if (!touch) return;
    
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    
    if (Math.abs(deltaX) > threshold && Math.abs(deltaY) < 100) {
      if (!isScrolling) {
        if (deltaX > 0 && options.onSwipeRight) {
          options.onSwipeRight();
        } else if (deltaX < 0 && options.onSwipeLeft) {
          options.onSwipeLeft();
        }
      }
    }
    
    if (Math.abs(deltaY) > threshold && Math.abs(deltaX) < 40) {
      if (deltaY > 0 && options.onSwipeDown) {
        options.onSwipeDown();
      } else if (deltaY < 0 && options.onSwipeUp) {
        options.onSwipeUp();
      }
    }
    
    startX = 0;
    startY = 0;
    isScrolling = false;
  }
  
  // Attach immediately to avoid lifecycle race conditions
  if (typeof window !== 'undefined') {
    target.addEventListener('touchstart', handleTouchStart as any, { capture: true, passive: false });
    target.addEventListener('touchend', handleTouchEnd as any, { capture: true, passive: false });
  }
  
  const cleanup = () => {
    target.removeEventListener('touchstart', handleTouchStart as any, { capture: true } as any);
    target.removeEventListener('touchend', handleTouchEnd as any, { capture: true } as any);
  };

  try {
    onDestroy(cleanup);
  } catch (e) {}
  
  return { destroy: cleanup };
}
