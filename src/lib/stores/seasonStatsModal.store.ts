import { writable } from 'svelte/store';
import type { Player } from '../types/nba';

export type SeasonStatsModalState = {
  open: boolean;
  loading: boolean;
  error: string;
  player: Player | null;
  playerId: string;
  headshot: string;
  headers: string[];
  row: Record<string, any> | null;
  historyLoading: boolean;
  historyError: string;
  historyRows: { season: string; row: Record<string, any> | null }[];
  seasonLabel: string;
  team: string;
};

const initialState: SeasonStatsModalState = {
  open: false,
  loading: false,
  error: '',
  player: null,
  playerId: '',
  headshot: '',
  headers: [],
  row: null,
  historyLoading: false,
  historyError: '',
  historyRows: [],
  seasonLabel: '',
  team: ''
};

export const seasonStatsModal = writable<SeasonStatsModalState>({ ...initialState });

export function openSeasonStatsModal(player: Player): void {
  seasonStatsModal.update((state) => ({
    ...state,
    open: true,
    player,
    playerId: player?.id ? String(player.id) : '',
    headshot: player?.headshot ?? '',
    headers: [],
    error: '',
    row: null,
    historyLoading: false,
    historyError: '',
    historyRows: [],
    seasonLabel: '',
    team: ''
  }));
}

export function updateSeasonStatsModal(partial: Partial<SeasonStatsModalState>): void {
  seasonStatsModal.update((state) => ({ ...state, ...partial }));
}

export function closeSeasonStatsModal(): void {
  seasonStatsModal.set({ ...initialState });
}
