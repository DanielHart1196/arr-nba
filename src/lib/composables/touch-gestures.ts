import { onDestroy } from 'svelte';

export interface TouchGestureOptions {
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeUp?: () => void;
  onSwipeDown?: () => void;
  onHorizontalDrag?: (deltaX: number) => void;
  onGestureEnd?: (didSwipe: boolean) => void;
  threshold?: number;
  preventScroll?: boolean;
  lockHorizontalSwipeAfterVerticalScroll?: boolean;
  lockHorizontalSwipeAfterInnerHorizontalScroll?: boolean;
  target?: HTMLElement | Document;
}

export function createTouchGestures(options: TouchGestureOptions = {}) {
  let startX = 0;
  let startY = 0;
  let isScrolling = false;
  let lockHorizontalSwipe = false;
  let ignoreGesture = false;
  let activeScrollContainer: HTMLElement | null = null;
  
  const threshold = options.threshold || 50;
  const target = options.target || (typeof document !== 'undefined' ? document : null);
  
  if (!target) return { destroy: () => {} };

  function handleTouchStart(event: TouchEvent) {
    const touch = event.touches?.[0];
    if (!touch) return;
    
    startX = touch.clientX;
    startY = touch.clientY;
    isScrolling = false;
    lockHorizontalSwipe = false;

    const targetEl = event.target as HTMLElement;
    ignoreGesture = !!targetEl?.closest?.('[data-no-swipe="true"]');
    if (ignoreGesture) return;
    activeScrollContainer = (targetEl?.closest?.('[data-scrollable="true"]') as HTMLElement | null) ||
                            (targetEl?.closest?.('.scroll-container') as HTMLElement | null);
    
    const isSwipeArea = !!(targetEl as any)?.closest?.('.swipe-area') || 
                        document.body.classList.contains('swipe-area') ||
                        document.documentElement.classList.contains('swipe-area');
    
    const isScrollContainer = !!activeScrollContainer;

    // Prioritize inner scrollable content over parent swipe areas.
    if (isScrollContainer) {
      isScrolling = true;
    } else if (isSwipeArea) {
      isScrolling = false;
    }
  }

  function canContainerConsumeHorizontalDrag(container: HTMLElement, deltaX: number): boolean {
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    if (maxScrollLeft <= 0) return false;

    // Finger moving left means content scrolls right (increasing scrollLeft).
    if (deltaX < 0) return container.scrollLeft < maxScrollLeft - 1;
    // Finger moving right means content scrolls left (decreasing scrollLeft).
    if (deltaX > 0) return container.scrollLeft > 1;
    return false;
  }

  function handleTouchMove(event: TouchEvent) {
    if (ignoreGesture) return;
    const touch = event.touches?.[0];
    if (!touch) return;

    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (options.lockHorizontalSwipeAfterVerticalScroll && absY > absX && absY > 6) {
      lockHorizontalSwipe = true;
    }

    if (activeScrollContainer && absX > absY) {
      // If inner container can still scroll horizontally, keep swipe locked to that container.
      if (canContainerConsumeHorizontalDrag(activeScrollContainer, deltaX)) {
        isScrolling = true;
        if (options.lockHorizontalSwipeAfterInnerHorizontalScroll) {
          lockHorizontalSwipe = true;
        }
      } else {
        // At the horizontal edge: allow parent swipe strip to take over.
        isScrolling = false;
      }
    }

    if (!isScrolling && !lockHorizontalSwipe && absX > absY) {
      options.onHorizontalDrag?.(deltaX);
    }
  }
  
  function handleTouchEnd(event: TouchEvent) {
    if (ignoreGesture) {
      ignoreGesture = false;
      options.onGestureEnd?.(false);
      return;
    }

    const touch = event.changedTouches?.[0];
    if (!touch) return;
    
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;
    
    let didSwipe = false;
    if (Math.abs(deltaX) > threshold && Math.abs(deltaY) < 100) {
      if (!isScrolling && !lockHorizontalSwipe) {
        if (deltaX > 0 && options.onSwipeRight) {
          options.onSwipeRight();
          didSwipe = true;
        } else if (deltaX < 0 && options.onSwipeLeft) {
          options.onSwipeLeft();
          didSwipe = true;
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
    lockHorizontalSwipe = false;
    activeScrollContainer = null;
    options.onGestureEnd?.(didSwipe);
  }
  
  // Attach immediately to avoid lifecycle race conditions
  if (typeof window !== 'undefined') {
    target.addEventListener('touchstart', handleTouchStart as any, { capture: true, passive: true });
    target.addEventListener('touchmove', handleTouchMove as any, { capture: true, passive: true });
    target.addEventListener('touchend', handleTouchEnd as any, { capture: true, passive: true });
  }
  
  const cleanup = () => {
    target.removeEventListener('touchstart', handleTouchStart as any, { capture: true } as any);
    target.removeEventListener('touchmove', handleTouchMove as any, { capture: true } as any);
    target.removeEventListener('touchend', handleTouchEnd as any, { capture: true } as any);
  };

  try {
    onDestroy(cleanup);
  } catch (e) {}
  
  return { destroy: cleanup };
}
