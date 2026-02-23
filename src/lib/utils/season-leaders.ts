import { resolveApiUrl } from '$lib/utils/runtime';

type LeadersBlock = { headers?: string[]; rows: any[] };
type LeadersPayload = { players: LeadersBlock; teams: LeadersBlock };

type HistoryPayload = {
  seasons?: Array<{
    season?: string;
    players?: {
      perGame?: LeadersBlock;
      totals?: LeadersBlock;
    };
  }>;
};

const EMPTY_BLOCK: LeadersBlock = { headers: [], rows: [] };

async function readLocalHistory(): Promise<HistoryPayload | null> {
  try {
    const res = await fetch('/season-history.json?v=3');
    if (!res.ok) return null;
    return (await res.json()) as HistoryPayload;
  } catch {
    return null;
  }
}

export async function getSeasonLeadersWithFallback(
  season: string,
  perMode: 'PerGame' | 'Totals'
): Promise<LeadersPayload> {
  const apiUrl = resolveApiUrl(`/api/season-leaders?season=${encodeURIComponent(season)}&perMode=${perMode}`);
  try {
    const res = await fetch(apiUrl);
    const json = await res.json().catch(() => ({}));
    if (res.ok && !json?.error) {
      return {
        players: (json?.players ?? EMPTY_BLOCK) as LeadersBlock,
        teams: (json?.teams ?? EMPTY_BLOCK) as LeadersBlock
      };
    }
  } catch {
    // Fallback below.
  }

  const history = await readLocalHistory();
  const entry = (history?.seasons ?? []).find((s) => String(s?.season ?? '') === season);
  const players = perMode === 'Totals' ? entry?.players?.totals : entry?.players?.perGame;

  return {
    players: (players ?? EMPTY_BLOCK) as LeadersBlock,
    teams: EMPTY_BLOCK
  };
}

