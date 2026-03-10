#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { shardSeasonHistory } = require('./shard-season-history.cjs');

const OUT_FILE = path.join(__dirname, '..', 'data', 'season-history.json');
const DELAY_MS = 250;

function seasonFromDate(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const startYear = month >= 10 ? year : year - 1;
  const endYear = String(startYear + 1).slice(-2);
  return `${startYear}-${endYear}`;
}

function buildSeasonList(count = 25) {
  const base = seasonFromDate();
  const startYear = Number(base.slice(0, 4)) || new Date().getFullYear();
  const seasons = [];
  for (let i = 0; i < count; i += 1) {
    const y = startYear - i;
    const end = String(y + 1).slice(-2);
    seasons.push(`${y}-${end}`);
  }
  return seasons;
}

function buildHeaders() {
  return {
    accept: 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9',
    origin: 'https://www.nba.com',
    referer: 'https://www.nba.com/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };
}

function mapResult(payload) {
  const resultSet = payload?.resultSet || payload?.resultSets?.[0];
  if (!resultSet) return { headers: [], rows: [] };
  const headers = resultSet.headers || [];
  const rows = resultSet.rowSet || [];
  const mappedRows = rows.map((row) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = row[i];
    });
    return obj;
  });
  return { headers, rows: mappedRows };
}

function buildDashParams(url, season, measureType) {
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSeason(season, perMode) {
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
  return { season, players: mapResult(playerJson), teams: mapResult(teamJson) };
}

async function main() {
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  const seasons = buildSeasonList(25);
  const currentSeason = seasonFromDate();
  const targetSeasons = seasons.filter((s) => s !== currentSeason);
  const results = [];

  for (const season of targetSeasons) {
    process.stdout.write(`Fetching ${season}... `);
    const perGame = await fetchSeason(season, 'PerGame');
    const totals = await fetchSeason(season, 'Totals');
    results.push({
      season,
      players: {
        perGame: perGame.players,
        totals: totals.players
      },
      teams: {
        perGame: perGame.teams,
        totals: totals.teams
      }
    });
    process.stdout.write('ok\n');
    await sleep(DELAY_MS);
  }

  const payload = { seasons: results };
  fs.writeFileSync(OUT_FILE, JSON.stringify(payload));
  shardSeasonHistory();
  process.stdout.write(`Wrote ${OUT_FILE}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
