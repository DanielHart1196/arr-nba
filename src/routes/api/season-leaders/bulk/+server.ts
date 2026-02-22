import { apiCache } from '$lib/cache/api-cache';

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

async function fetchSeason(season: string): Promise<{ season: string; players: { headers: string[]; rows: any[] } }> {
  const cacheKey = `season-stats:v2:${season}`;
  const data = await apiCache.getOrFetch(
    cacheKey,
    async () => {
      const headers = buildHeaders();
      const playerUrl = new URL('https://stats.nba.com/stats/leaguedashplayerstats');
      buildDashParams(playerUrl, season, 'Base');
      playerUrl.searchParams.set('StarterBench', '');

      const res = await fetch(playerUrl.toString(), { headers });
      if (!res.ok) throw new Error(`NBA player stats error: ${res.status}`);
      const json = await res.json();
      const players = mapResult(json);

      return { season, players };
    },
    10 * 60 * 1000
  );

  return { season, players: data.players };
}

export const GET = async ({ url }: any) => {
  const seasonsParam = url.searchParams.get('seasons') || '';
  const seasons = seasonsParam.split(',').map((s: string) => s.trim()).filter(Boolean);
  if (seasons.length === 0) {
    return new Response(JSON.stringify({ error: 'Missing seasons' }), {
      status: 400,
      headers: { 'content-type': 'application/json' }
    });
  }

  try {
    const results: { season: string; players: { headers: string[]; rows: any[] } }[] = [];
    for (const season of seasons) {
      results.push(await fetchSeason(season));
    }
    return new Response(JSON.stringify({ seasons: results }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'unknown' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
};
