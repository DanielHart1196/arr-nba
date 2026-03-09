#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '..', 'static', 'season-history.json');
const START_YEAR = 2024; // will walk down until stop condition
const MIN_YEAR = 1946;
const MEASURE_TYPE = 'Base';
const CONSECUTIVE_EMPTY_LIMIT = 3;
const REQUEST_DELAY_MS = 900;
const PER_MODES = ['PerGame', 'Totals'];
const FETCH_RETRIES = 3;
const RETRY_DELAY_MS = 1200;

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

function hasModeBlock(entry, rootKey, modeKey) {
  const block = entry?.[rootKey]?.[modeKey];
  return Array.isArray(block?.headers) && Array.isArray(block?.rows);
}

function hasCompleteSeasonData(entry) {
  if (!entry) return false;
  return (
    hasModeBlock(entry, 'players', 'perGame') &&
    hasModeBlock(entry, 'players', 'totals') &&
    hasModeBlock(entry, 'teams', 'perGame') &&
    hasModeBlock(entry, 'teams', 'totals')
  );
}

async function fetchSeason(season) {
  const headers = buildHeaders();
  const players = {};
  const teams = {};

  for (const perMode of PER_MODES) {
    const playerUrl = new URL('https://stats.nba.com/stats/leaguedashplayerstats');
    buildDashParams(playerUrl, season, MEASURE_TYPE);
    playerUrl.searchParams.set('PerMode', perMode);
    playerUrl.searchParams.set('StarterBench', '');

    const teamUrl = new URL('https://stats.nba.com/stats/leaguedashteamstats');
    buildDashParams(teamUrl, season, MEASURE_TYPE);
    teamUrl.searchParams.set('PerMode', perMode);

    const [playerRes, teamRes] = await Promise.all([
      fetch(playerUrl.toString(), { headers }),
      fetch(teamUrl.toString(), { headers })
    ]);

    if (!playerRes.ok) throw new Error(`NBA player stats error (${perMode}): ${playerRes.status}`);
    if (!teamRes.ok) throw new Error(`NBA team stats error (${perMode}): ${teamRes.status}`);

    const playerJson = await playerRes.json();
    const teamJson = await teamRes.json();
    const key = perMode === 'Totals' ? 'totals' : 'perGame';
    players[key] = mapResult(playerJson);
    teams[key] = mapResult(teamJson);
  }

  return { season, players, teams };
}

async function fetchSeasonWithRetry(season) {
  let lastError = null;
  for (let attempt = 1; attempt <= FETCH_RETRIES; attempt += 1) {
    try {
      return await fetchSeason(season);
    } catch (err) {
      lastError = err;
      if (attempt < FETCH_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
      }
    }
  }
  throw lastError || new Error('unknown fetch error');
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
    const existing = existingBySeason.get(key);
    if (hasCompleteSeasonData(existing)) {
      results.push(existing);
      continue;
    }

    process.stdout.write(`Fetching ${key}... `);
    try {
      const data = await fetchSeasonWithRetry(key);
      const rows = data.players?.perGame?.rows ?? [];
      if (!rows.length) {
        emptyCount += 1;
        console.log('empty');
      } else {
        emptyCount = 0;
        console.log(`ok (${rows.length})`);
      }
      results.push({ season: key, players: data.players, teams: data.teams });
    } catch (err) {
      emptyCount += 1;
      console.log(`error (${err.message})`);
      if (existing) {
        results.push(existing);
      } else {
        const emptyBlock = { headers: [], rows: [] };
        results.push({
          season: key,
          players: { perGame: emptyBlock, totals: emptyBlock },
          teams: { perGame: emptyBlock, totals: emptyBlock }
        });
      }
    }

    if (emptyCount >= CONSECUTIVE_EMPTY_LIMIT) {
      console.log(`Stopping after ${emptyCount} consecutive empty/error seasons.`);
      break;
    }

    await sleep(REQUEST_DELAY_MS);
  }

  // Merge and sort seasons desc
  const merged = new Map(seasons.map((s) => [s.season, s]));
  for (const s of results) merged.set(s.season, s);

  const final = Array.from(merged.values()).sort((a, b) => (a.season < b.season ? 1 : -1));
  fs.writeFileSync(OUT_PATH, JSON.stringify({ seasons: final }));
  console.log(`Wrote ${final.length} seasons to ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
