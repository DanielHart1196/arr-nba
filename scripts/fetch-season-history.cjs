#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '..', 'static', 'season-history.json');
const START_YEAR = 2024; // will walk down until stop condition
const MIN_YEAR = 1946;
const PER_MODE = 'PerGame';
const MEASURE_TYPE = 'Base';
const CONSECUTIVE_EMPTY_LIMIT = 3;
const REQUEST_DELAY_MS = 900;

function seasonKey(startYear) {
  const end = String(startYear + 1).slice(-2);
  return `${startYear}-${end}`;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function buildHeaders() {
  return {
    'accept': 'application/json, text/plain, */*',
    'accept-language': 'en-US,en;q=0.9',
    'origin': 'https://www.nba.com',
    'referer': 'https://www.nba.com/',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  };
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
  url.searchParams.set('PerMode', PER_MODE);
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

async function fetchSeason(season) {
  const headers = buildHeaders();
  const playerUrl = new URL('https://stats.nba.com/stats/leaguedashplayerstats');
  buildDashParams(playerUrl, season, MEASURE_TYPE);
  playerUrl.searchParams.set('StarterBench', '');

  const res = await fetch(playerUrl.toString(), { headers });
  if (!res.ok) throw new Error(`NBA player stats error: ${res.status}`);
  const json = await res.json();
  const players = mapResult(json);
  return { season, players };
}

async function main() {
  let seasons = [];
  try {
    if (fs.existsSync(OUT_PATH)) {
      const existing = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
      if (Array.isArray(existing?.seasons)) seasons = existing.seasons;
    }
  } catch {}

  const existingBySeason = new Map(seasons.map((s) => [s.season, s]));
  const results = [];

  let emptyCount = 0;
  for (let y = START_YEAR; y >= MIN_YEAR; y--) {
    const key = seasonKey(y);
    if (existingBySeason.has(key)) {
      results.push(existingBySeason.get(key));
      continue;
    }

    process.stdout.write(`Fetching ${key}... `);
    try {
      const data = await fetchSeason(key);
      const rows = data.players?.rows ?? [];
      if (!rows.length) {
        emptyCount += 1;
        console.log('empty');
      } else {
        emptyCount = 0;
        console.log(`ok (${rows.length})`);
      }
      results.push({ season: key, players: data.players });
    } catch (err) {
      emptyCount += 1;
      console.log(`error (${err.message})`);
      results.push({ season: key, players: { headers: [], rows: [] } });
    }

    if (emptyCount >= CONSECUTIVE_EMPTY_LIMIT) {
      console.log(`Stopping after ${emptyCount} consecutive empty/error seasons.`);
      break;
    }

    await sleep(REQUEST_DELAY_MS);
  }

  // Merge and sort seasons desc
  const merged = new Map(results.map((s) => [s.season, s]));
  for (const s of seasons) merged.set(s.season, s);

  const final = Array.from(merged.values()).sort((a, b) => (a.season < b.season ? 1 : -1));
  fs.writeFileSync(OUT_PATH, JSON.stringify({ seasons: final }));
  console.log(`Wrote ${final.length} seasons to ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
