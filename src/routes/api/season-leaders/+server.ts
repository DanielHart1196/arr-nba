import { apiCache } from '$lib/cache/api-cache';

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
    'origin': 'https://www.nba.com',
    'referer': 'https://www.nba.com/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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

export const GET = async ({ url }: any) => {
  const season = url.searchParams.get('season') || seasonFromDate();
  const perMode = url.searchParams.get('perMode') || 'PerGame';
  const cacheKey = `season-stats:v2:${season}:${perMode}`;

  try {
    const data = await apiCache.getOrFetch(
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

        const [playerRes, teamRes] = await Promise.all([
          fetch(playerUrl.toString(), { headers }),
          fetch(teamUrl.toString(), { headers })
        ]);

        if (!playerRes.ok) throw new Error(`NBA player stats error: ${playerRes.status}`);
        if (!teamRes.ok) throw new Error(`NBA team stats error: ${teamRes.status}`);

        const [playerJson, teamJson] = await Promise.all([playerRes.json(), teamRes.json()]);
        const players = mapResult(playerJson);
        const teams = mapResult(teamJson);

        return {
          season,
          players,
          teams
        };
      },
      10 * 60 * 1000
    );

    return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'unknown' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
};
