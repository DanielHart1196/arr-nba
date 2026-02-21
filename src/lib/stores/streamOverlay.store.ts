import { writable } from 'svelte/store';

export type StreamSource = { label: string; url: string; mode?: 'auto' | 'video' | 'embed' | 'external' };

interface StreamOverlayState {
  title: string;
  streamUrl: string;
  sources: StreamSource[];
  storageKey: string;
  closedButtonLabel: string;
  secondaryButtonLabel: string;
  secondaryIframeUrl: string;
  secondaryExternalUrl: string;
  secondaryExternalLabel: string;
  openToken: number;
  contextId: string | null;
}

const DEFAULT_STATE: StreamOverlayState = {
  title: 'Live Stream',
  streamUrl: '',
  sources: [],
  storageKey: 'arrnba.streamOverlay.global',
  closedButtonLabel: 'Open Stream',
  secondaryButtonLabel: '',
  secondaryIframeUrl: '',
  secondaryExternalUrl: '',
  secondaryExternalLabel: '',
  openToken: 0,
  contextId: null
};

function createStreamOverlayStore() {
  const { subscribe, update, set } = writable<StreamOverlayState>({ ...DEFAULT_STATE });

  return {
    subscribe,
    open: (payload: Partial<StreamOverlayState> & { contextId?: string | null }) => {
      update((state) => ({
        ...state,
        ...payload,
        contextId: payload.contextId ?? state.contextId ?? null,
        openToken: state.openToken + 1
      }));
    },
    updateIfActive: (contextId: string, payload: Partial<StreamOverlayState>) => {
      update((state) => {
        if (state.contextId !== contextId) return state;
        return { ...state, ...payload };
      });
    },
    clear: () => set({ ...DEFAULT_STATE })
  };
}

export const streamOverlayStore = createStreamOverlayStore();
