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

const PLAYER_ADVANCED_FIELDS = [
  'TS_PCT',
  'EFG_PCT',
  'USG_PCT',
  'AST_PCT',
  'REB_PCT',
  'OREB_PCT',
  'DREB_PCT',
  'AST_TO',
  'NET_RATING',
  'OFF_RATING',
  'DEF_RATING',
  'PIE'
];

const TEAM_ADVANCED_FIELDS = [
  'TS_PCT',
  'EFG_PCT',
  'AST_PCT',
  'REB_PCT',
  'OREB_PCT',
  'DREB_PCT',
  'AST_TO',
  'NET_RATING',
  'OFF_RATING',
  'DEF_RATING',
  'PACE',
  'PIE'
];

function mergeAdvancedBlock(
  base: { headers: string[]; rows: any[] },
  advanced: { headers: string[]; rows: any[] },
  idKey: string,
  fields: string[]
): { headers: string[]; rows: any[] } {
  const keepFields = fields.filter((key) => advanced.headers.includes(key));
  if (keepFields.length === 0) return base;

  const advById = new Map<string, any>();
  for (const row of advanced.rows) {
    const id = String(row?.[idKey] ?? '');
    if (!id) continue;
    advById.set(id, row);
  }

  const mergedRows = base.rows.map((row) => {
    const id = String(row?.[idKey] ?? '');
    const adv = id ? advById.get(id) : null;
    if (!adv) return row;
    const out = { ...row };
    for (const key of keepFields) {
      if (adv[key] !== undefined) out[key] = adv[key];
    }
    return out;
  });

  const mergedHeaders = [...base.headers];
  for (const key of keepFields) {
    if (!mergedHeaders.includes(key)) mergedHeaders.push(key);
  }

  return { headers: mergedHeaders, rows: mergedRows };
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

async function withOverallTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`${label} timeout after ${timeoutMs}ms`);
      (error as any).diagnostics = { timeoutMs, label };
      reject(error);
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export const GET = async ({ url }: any) => {
  const season = url.searchParams.get('season') || seasonFromDate();
  const perMode = url.searchParams.get('perMode') || 'PerGame';
  const cacheKey = `season-stats:v2:${season}:${perMode}`;
  const timeoutMs = 9000;
  const overallTimeoutMs = 15000;

  try {
    const data = await withOverallTimeout(
      apiCache.getOrFetch<SeasonLeadersPayload>(
        cacheKey,
        async () => {
        const headers = buildHeaders();
        const playerBaseUrl = new URL('https://stats.nba.com/stats/leaguedashplayerstats');
        buildDashParams(playerBaseUrl, season, 'Base');
        playerBaseUrl.searchParams.set('PerMode', perMode);
        playerBaseUrl.searchParams.set('StarterBench', '');

        const teamBaseUrl = new URL('https://stats.nba.com/stats/leaguedashteamstats');
        buildDashParams(teamBaseUrl, season, 'Base');
        teamBaseUrl.searchParams.set('PerMode', perMode);

        const playerAdvancedUrl = new URL('https://stats.nba.com/stats/leaguedashplayerstats');
        buildDashParams(playerAdvancedUrl, season, 'Advanced');
        playerAdvancedUrl.searchParams.set('PerMode', perMode);
        playerAdvancedUrl.searchParams.set('StarterBench', '');

        const teamAdvancedUrl = new URL('https://stats.nba.com/stats/leaguedashteamstats');
        buildDashParams(teamAdvancedUrl, season, 'Advanced');
        teamAdvancedUrl.searchParams.set('PerMode', perMode);

        const startedAt = Date.now();
        const [playerBaseRes, teamBaseRes] = await Promise.all([
          fetchWithTimeout(playerBaseUrl.toString(), { headers }, timeoutMs, 'player-base'),
          fetchWithTimeout(teamBaseUrl.toString(), { headers }, timeoutMs, 'team-base')
        ]);
        const durationMs = Date.now() - startedAt;

        if (!playerBaseRes.ok) {
          const body = await playerBaseRes.text().catch(() => '');
          const error = new Error(`NBA player stats error: ${playerBaseRes.status}`);
          (error as any).diagnostics = {
            durationMs,
            playerStatus: playerBaseRes.status,
            playerStatusText: playerBaseRes.statusText,
            playerCfRay: playerBaseRes.headers.get('cf-ray'),
            playerServer: playerBaseRes.headers.get('server'),
            playerBodySample: body.slice(0, 400)
          };
          throw error;
        }
        if (!teamBaseRes.ok) {
          const body = await teamBaseRes.text().catch(() => '');
          const error = new Error(`NBA team stats error: ${teamBaseRes.status}`);
          (error as any).diagnostics = {
            durationMs,
            teamStatus: teamBaseRes.status,
            teamStatusText: teamBaseRes.statusText,
            teamCfRay: teamBaseRes.headers.get('cf-ray'),
            teamServer: teamBaseRes.headers.get('server'),
            teamBodySample: body.slice(0, 400)
          };
          throw error;
        }
        const [playerBaseJson, teamBaseJson] = await Promise.all([
          playerBaseRes.json(),
          teamBaseRes.json()
        ]);
        const playerBase = mapResult(playerBaseJson);
        const teamBase = mapResult(teamBaseJson);
        let players = playerBase;
        let teams = teamBase;

        const advancedDiagnostics: Record<string, any> = {};
        const [playerAdvancedResult, teamAdvancedResult] = await Promise.allSettled([
          fetchWithTimeout(playerAdvancedUrl.toString(), { headers }, timeoutMs, 'player-advanced'),
          fetchWithTimeout(teamAdvancedUrl.toString(), { headers }, timeoutMs, 'team-advanced')
        ]);

        if (playerAdvancedResult.status === 'fulfilled' && playerAdvancedResult.value.ok) {
          const playerAdvancedJson = await playerAdvancedResult.value.json();
          const playerAdvanced = mapResult(playerAdvancedJson);
          players = mergeAdvancedBlock(playerBase, playerAdvanced, 'PLAYER_ID', PLAYER_ADVANCED_FIELDS);
        } else {
          const response = playerAdvancedResult.status === 'fulfilled' ? playerAdvancedResult.value : null;
          const errorMessage = playerAdvancedResult.status === 'rejected'
            ? (playerAdvancedResult.reason?.message ?? 'request failed')
            : null;
          advancedDiagnostics.playerAdvanced = response
            ? {
                status: response.status,
                statusText: response.statusText,
                cfRay: response.headers.get('cf-ray'),
                server: response.headers.get('server')
              }
            : {
                error: errorMessage
              };
        }

        if (teamAdvancedResult.status === 'fulfilled' && teamAdvancedResult.value.ok) {
          const teamAdvancedJson = await teamAdvancedResult.value.json();
          const teamAdvanced = mapResult(teamAdvancedJson);
          teams = mergeAdvancedBlock(teamBase, teamAdvanced, 'TEAM_ID', TEAM_ADVANCED_FIELDS);
        } else {
          const response = teamAdvancedResult.status === 'fulfilled' ? teamAdvancedResult.value : null;
          const errorMessage = teamAdvancedResult.status === 'rejected'
            ? (teamAdvancedResult.reason?.message ?? 'request failed')
            : null;
          advancedDiagnostics.teamAdvanced = response
            ? {
                status: response.status,
                statusText: response.statusText,
                cfRay: response.headers.get('cf-ray'),
                server: response.headers.get('server')
              }
            : {
                error: errorMessage
              };
        }

        if (Object.keys(advancedDiagnostics).length > 0) {
          console.warn('[season-leaders][advanced-partial]', {
            season,
            perMode,
            durationMs,
            diagnostics: advancedDiagnostics
          });
        }

        const payload: SeasonLeadersPayload = {
          season,
          players,
          teams
        };
        lastGoodByKey.set(cacheKey, { data: payload, ts: Date.now() });
        return payload;
        },
        10 * 60 * 1000
      ),
      overallTimeoutMs,
      'season-leaders-handler'
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
