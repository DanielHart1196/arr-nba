import { writable, derived } from 'svelte/store';
import type { Event } from '../types/nba';

interface AppState {
  events: Event[];
  loading: boolean;
  error: string | null;
  hideScores: boolean;
  lastUpdated: number | null;
}

function createAppStore() {
  const { subscribe, set, update } = writable<AppState>({
    events: [],
    loading: false,
    error: null,
    hideScores: false,
    lastUpdated: null
  });

  return {
    subscribe,
    
    setLoading: (loading: boolean) => {
      update(state => ({ ...state, loading }));
    },
    
    setEvents: (events: Event[]) => {
      update(state => ({ 
        ...state, 
        events, 
        loading: false, 
        error: null, 
        lastUpdated: Date.now() 
      }));
    },
    
    setError: (error: string) => {
      update(state => ({ ...state, loading: false, error }));
    },
    
    toggleHideScores: () => {
      update(state => {
        const newHideScores = !state.hideScores;
        // Persist to localStorage
        try {
          localStorage.setItem('arrnba.hideScores', newHideScores ? '1' : '0');
        } catch {}
        return { ...state, hideScores: newHideScores };
      });
    },
    
    loadHideScoresPreference: () => {
      try {
        const v = localStorage.getItem('arrnba.hideScores');
        const hideScores = v === '1';
        update(state => ({ ...state, hideScores }));
      } catch {}
    },
    
    reset: () => {
      set({
        events: [],
        loading: false,
        error: null,
        hideScores: false,
        lastUpdated: null
      });
    }
  };
}

export const appStore = createAppStore();

// Derived stores for convenience
export const events = derived(appStore, $appStore => $appStore.events);
export const loading = derived(appStore, $appStore => $appStore.loading);
export const error = derived(appStore, $appStore => $appStore.error);
export const hideScores = derived(appStore, $appStore => $appStore.hideScores);
