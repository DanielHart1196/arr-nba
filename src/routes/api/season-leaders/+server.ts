import { apiCache } from '$lib/cache/api-cache';

type SeasonLeadersPayload = {
  season: string;
  players: { headers: string[]; rows: any[] };
  teams: { headers: string[]; rows: any[] };
  stale?: boolean;
  staleAgeMs?: number;
};

const lastGoodByKey = new Map<string, { data: SeasonLeadersPayload; ts: number }>();
const LAST_GOOD_MAX_AGE_MS = 6 * 60 * 60 * 1000;

function seasonFromDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const startYear = month >= 10 ? year : year - 1;
  const endYear = String(startYear + 1).slice(-2);
  return `${startYear}-${endYear}`;
}

function buildHeaders(): HeadersInit {
  return {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9',
    'cache-control': 'no-cache',
    'origin': 'https://www.nba.com',
    'pragma': 'no-cache',
    'referer': 'https://www.nba.com/stats/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'x-nba-stats-origin': 'stats',
    'x-nba-stats-token': 'true'
  };
}

function mapResult(payload: any): { headers: string[]; rows: any[] } {
  const resultSet = payload?.resultSet || payload?.resultSets?.[0];
  if (!resultSet) return { headers: [], rows: [] };
  const headers: string[] = resultSet.headers || [];
  const rows: any[] = resultSet.rowSet || [];
  const mappedRows = rows.map((row) => {
    const obj: Record<string, any> = {};
    headers.forEach((h, i) => {
      obj[h] = row[i];
    });
    return obj;
  });
  return { headers, rows: mappedRows };
}

function buildDashParams(url: URL, season: string, measureType: 'Base' | 'Advanced'): void {
  url.searchParams.set('DateFrom', '');
  url.searchParams.set('DateTo', '');
  url.searchParams.set('GameScope', '');
  url.searchParams.set('GameSegment', '');
  url.searchParams.set('LastNGames', '0');
  url.searchParams.set('LeagueID', '00');
  url.searchParams.set('Location', '');
  url.searchParams.set('MeasureType', measureType);
  url.searchParams.set('Month', '0');
  url.searchParams.set('OpponentTeamID', '0');
  url.searchParams.set('Outcome', '');
  url.searchParams.set('PORound', '0');
  url.searchParams.set('PaceAdjust', 'N');
  url.searchParams.set('PerMode', 'PerGame');
  url.searchParams.set('Period', '0');
  url.searchParams.set('PlusMinus', 'N');
  url.searchParams.set('Rank', 'N');
  url.searchParams.set('Season', season);
  url.searchParams.set('SeasonSegment', '');
  url.searchParams.set('SeasonType', 'Regular Season');
  url.searchParams.set('ShotClockRange', '');
  url.searchParams.set('TeamID', '0');
  url.searchParams.set('TwoWay', '0');
  url.searchParams.set('VsConference', '');
  url.searchParams.set('VsDivision', '');
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  label: string
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (e: any) {
    if (e?.name === 'AbortError') {
      const err = new Error(`NBA ${label} stats timeout after ${timeoutMs}ms`);
      (err as any).diagnostics = { timeoutMs, label };
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export const GET = async ({ url }: any) => {
  const season = url.searchParams.get('season') || seasonFromDate();
  const perMode = url.searchParams.get('perMode') || 'PerGame';
  const cacheKey = `season-stats:v2:${season}:${perMode}`;
  const timeoutMs = 9000;

  try {
    const data = await apiCache.getOrFetch<SeasonLeadersPayload>(
      cacheKey,
      async () => {
        const headers = buildHeaders();
        const playerUrl = new URL('https://stats.nba.com/stats/leaguedashplayerstats');
        buildDashParams(playerUrl, season, 'Base');
        playerUrl.searchParams.set('PerMode', perMode);
        playerUrl.searchParams.set('StarterBench', '');

        const teamUrl = new URL('https://stats.nba.com/stats/leaguedashteamstats');
        buildDashParams(teamUrl, season, 'Base');
        teamUrl.searchParams.set('PerMode', perMode);

        const startedAt = Date.now();
        const [playerRes, teamRes] = await Promise.all([
          fetchWithTimeout(playerUrl.toString(), { headers }, timeoutMs, 'player'),
          fetchWithTimeout(teamUrl.toString(), { headers }, timeoutMs, 'team')
        ]);
        const durationMs = Date.now() - startedAt;

        if (!playerRes.ok) {
          const body = await playerRes.text().catch(() => '');
          const error = new Error(`NBA player stats error: ${playerRes.status}`);
          (error as any).diagnostics = {
            durationMs,
            playerStatus: playerRes.status,
            playerStatusText: playerRes.statusText,
            playerCfRay: playerRes.headers.get('cf-ray'),
            playerServer: playerRes.headers.get('server'),
            playerBodySample: body.slice(0, 400)
          };
          throw error;
        }
        if (!teamRes.ok) {
          const body = await teamRes.text().catch(() => '');
          const error = new Error(`NBA team stats error: ${teamRes.status}`);
          (error as any).diagnostics = {
            durationMs,
            teamStatus: teamRes.status,
            teamStatusText: teamRes.statusText,
            teamCfRay: teamRes.headers.get('cf-ray'),
            teamServer: teamRes.headers.get('server'),
            teamBodySample: body.slice(0, 400)
          };
          throw error;
        }

        const [playerJson, teamJson] = await Promise.all([playerRes.json(), teamRes.json()]);
        const players = mapResult(playerJson);
        const teams = mapResult(teamJson);

        const payload: SeasonLeadersPayload = {
          season,
          players,
          teams
        };
        lastGoodByKey.set(cacheKey, { data: payload, ts: Date.now() });
        return payload;
      },
      10 * 60 * 1000
    );

    return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e: any) {
    console.error('[season-leaders][error]', {
      season,
      perMode,
      error: e?.message,
      diagnostics: e?.diagnostics ?? null
    });
    const lastGood = lastGoodByKey.get(cacheKey);
    if (lastGood && Date.now() - lastGood.ts <= LAST_GOOD_MAX_AGE_MS) {
      const stalePayload: SeasonLeadersPayload = {
        ...lastGood.data,
        stale: true,
        staleAgeMs: Date.now() - lastGood.ts
      };
      return new Response(JSON.stringify(stalePayload), {
        status: 200,
        headers: { 'content-type': 'application/json', 'x-arrnba-stale': '1' }
      });
    }

    const errorPayload = {
      error: e?.message ?? 'unknown',
      diagnostics: e?.diagnostics ?? null,
      season,
      perMode
    };
    return new Response(JSON.stringify(errorPayload), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
};
