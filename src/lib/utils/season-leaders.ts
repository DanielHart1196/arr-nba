import { resolveApiUrl } from '$lib/utils/runtime';
import { loadSeasonHistoryEntry } from '$lib/utils/season-history';
import { isNativeRuntime } from '$lib/utils/runtime';

type LeadersBlock = { headers?: string[]; rows: any[] };
type LeadersPayload = { players: LeadersBlock; teams: LeadersBlock };
type SeasonLeadersFailure = {
  error?: string;
  diagnostics?: any;
  season?: string;
  perMode?: string;
  status?: number;
};

const EMPTY_BLOCK: LeadersBlock = { headers: [], rows: [] };
const NATIVE_CACHE_PREFIX = 'arrnba:native:season-leaders:';
const NATIVE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

type NativeCacheEntry = {
  ts: number;
  data: LeadersPayload;
};

async function fetchWithTimeout(input: RequestInfo | URL, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { signal: controller.signal });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(`Season leaders client timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildDashParams(season: string, perMode: 'PerGame' | 'Totals') {
  return {
    DateFrom: '',
    DateTo: '',
    GameScope: '',
    GameSegment: '',
    LastNGames: '0',
    LeagueID: '00',
    Location: '',
    MeasureType: 'Base',
    Month: '0',
    OpponentTeamID: '0',
    Outcome: '',
    PORound: '0',
    PaceAdjust: 'N',
    PerMode: perMode,
    Period: '0',
    PlusMinus: 'N',
    Rank: 'N',
    Season: season,
    SeasonSegment: '',
    SeasonType: 'Regular Season',
    ShotClockRange: '',
    TeamID: '0',
    TwoWay: '0',
    VsConference: '',
    VsDivision: ''
  };
}

function mapResult(payload: any): LeadersBlock {
  const resultSet = payload?.resultSet || payload?.resultSets?.[0];
  if (!resultSet) return EMPTY_BLOCK;
  const headers: string[] = Array.isArray(resultSet.headers) ? resultSet.headers : [];
  const rowsRaw: any[] = Array.isArray(resultSet.rowSet) ? resultSet.rowSet : [];
  const rows = rowsRaw.map((row) => {
    const out: Record<string, any> = {};
    headers.forEach((h, i) => {
      out[h] = row?.[i];
    });
    return out;
  });
  return { headers, rows };
}

async function fetchNativeSeasonLeaders(
  season: string,
  perMode: 'PerGame' | 'Totals'
): Promise<LeadersPayload | null> {
  if (!isNativeRuntime()) return null;
  try {
    const { CapacitorHttp } = await import('@capacitor/core');
    const headers = {
      accept: 'application/json, text/plain, */*',
      'accept-language': 'en-US,en;q=0.9',
      origin: 'https://stats.nba.com',
      referer: 'https://stats.nba.com/',
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'x-nba-stats-origin': 'stats',
      'x-nba-stats-token': 'true'
    };

    const params = buildDashParams(season, perMode);
    const [playerRes, teamRes] = await Promise.all([
      CapacitorHttp.request({
        method: 'GET',
        url: 'https://stats.nba.com/stats/leaguedashplayerstats',
        params,
        headers,
        connectTimeout: 20000,
        readTimeout: 20000
      }),
      CapacitorHttp.request({
        method: 'GET',
        url: 'https://stats.nba.com/stats/leaguedashteamstats',
        params,
        headers,
        connectTimeout: 20000,
        readTimeout: 20000
      })
    ]);

    if (playerRes.status < 200 || playerRes.status >= 300) return null;
    if (teamRes.status < 200 || teamRes.status >= 300) return null;

    const players = mapResult(typeof playerRes.data === 'string' ? JSON.parse(playerRes.data) : playerRes.data);
    const teams = mapResult(typeof teamRes.data === 'string' ? JSON.parse(teamRes.data) : teamRes.data);

    return { players, teams };
  } catch {
    return null;
  }
}

async function readLocalHistorySeason(season: string) {
  try {
    return await loadSeasonHistoryEntry(season);
  } catch {
    return null;
  }
}

async function readNativeCache(key: string): Promise<NativeCacheEntry | null> {
  if (!isNativeRuntime()) return null;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key });
    if (!value) return null;
    const parsed = JSON.parse(value) as NativeCacheEntry;
    if (!parsed || typeof parsed.ts !== 'number' || !parsed.data) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function writeNativeCache(key: string, data: LeadersPayload): Promise<void> {
  if (!isNativeRuntime()) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const payload: NativeCacheEntry = { ts: Date.now(), data };
    await Preferences.set({ key, value: JSON.stringify(payload) });
  } catch {
    // Ignore cache write failures.
  }
}

export async function getSeasonLeadersWithFallback(
  season: string,
  perMode: 'PerGame' | 'Totals'
): Promise<LeadersPayload> {
  let lastFailure: SeasonLeadersFailure | null = null;
  if (isNativeRuntime()) {
    const cacheKey = `${NATIVE_CACHE_PREFIX}${season}:${perMode}`;
    const cached = await readNativeCache(cacheKey);
    if (cached && Date.now() - cached.ts < NATIVE_CACHE_TTL_MS) {
      return cached.data;
    }

    const nativeDirect = await fetchNativeSeasonLeaders(season, perMode);
    if (nativeDirect) {
      await writeNativeCache(cacheKey, nativeDirect);
      return nativeDirect;
    }

    if (cached?.data) return cached.data;
  }

  const apiUrl = resolveApiUrl(`/api/season-leaders?season=${encodeURIComponent(season)}&perMode=${perMode}`);
  const apiTimeoutAttempts = [6000, 12000];
  for (let i = 0; i < apiTimeoutAttempts.length; i++) {
    try {
      const res = await fetchWithTimeout(apiUrl, apiTimeoutAttempts[i]);
      const json = await res.json().catch(() => ({}));
      if (res.ok && !json?.error) {
        return {
          players: (json?.players ?? EMPTY_BLOCK) as LeadersBlock,
          teams: (json?.teams ?? EMPTY_BLOCK) as LeadersBlock
        };
      }
      lastFailure = {
        error: json?.error ?? `Season leaders API error: ${res.status}`,
        diagnostics: json?.diagnostics ?? null,
        season: json?.season ?? season,
        perMode: json?.perMode ?? perMode,
        status: res.status
      };
    } catch (error: any) {
      lastFailure = {
        error: error?.message ?? 'Season leaders request failed',
        diagnostics: error?.diagnostics ?? null,
        season,
        perMode,
        status: null as any
      };
    }
    if (i < apiTimeoutAttempts.length - 1) {
      await sleep(220);
    }
  }

  const nativeDirect = await fetchNativeSeasonLeaders(season, perMode);
  if (nativeDirect) return nativeDirect;

  const entry = await readLocalHistorySeason(season);
  const players = perMode === 'Totals' ? entry?.players?.totals : entry?.players?.perGame;
  const teams = perMode === 'Totals' ? entry?.teams?.totals : entry?.teams?.perGame;
  const hasFallbackRows = (players?.rows?.length ?? 0) > 0 || (teams?.rows?.length ?? 0) > 0;

  if (!hasFallbackRows && lastFailure) {
    const error = new Error(lastFailure.error ?? 'Failed to load season leaders');
    (error as any).diagnostics = lastFailure.diagnostics ?? null;
    (error as any).season = lastFailure.season ?? season;
    (error as any).perMode = lastFailure.perMode ?? perMode;
    (error as any).status = lastFailure.status ?? null;
    throw error;
  }

  return {
    players: (players ?? EMPTY_BLOCK) as LeadersBlock,
    teams: (teams ?? EMPTY_BLOCK) as LeadersBlock
  };
}
