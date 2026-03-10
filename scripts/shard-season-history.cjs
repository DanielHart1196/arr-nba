#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE_FILE = path.join(ROOT, 'data', 'season-history.json');
const TARGET_DIR = path.join(ROOT, 'static', 'season-history');
const SEASONS_DIR = path.join(TARGET_DIR, 'seasons');
const MANIFEST_FILE = path.join(TARGET_DIR, 'index.json');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function slugifySeason(season) {
  return String(season || '').replace(/[^0-9-]/g, '');
}

function blockHasRows(block) {
  return Array.isArray(block?.rows) && block.rows.length > 0;
}

function seasonHasData(entry) {
  return (
    blockHasRows(entry?.players?.perGame) ||
    blockHasRows(entry?.players?.totals) ||
    blockHasRows(entry?.teams?.perGame) ||
    blockHasRows(entry?.teams?.totals)
  );
}

function shardSeasonHistory() {
  if (!fs.existsSync(SOURCE_FILE)) {
    throw new Error(`Missing source file: ${SOURCE_FILE}`);
  }

  const raw = fs.readFileSync(SOURCE_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  const seasons = Array.isArray(parsed?.seasons) ? parsed.seasons : [];

  ensureDir(SEASONS_DIR);

  const manifest = {
    version: 1,
    seasons: seasons.map((entry) => {
      const season = String(entry?.season ?? '');
      const file = `season-history/seasons/${slugifySeason(season)}.json`;
      fs.writeFileSync(
        path.join(ROOT, 'static', file),
        JSON.stringify({
          version: 1,
          season,
          entry
        })
      );
      return {
        season,
        file: `/${file}`,
        hasData: seasonHasData(entry)
      };
    })
  };

  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest));
  process.stdout.write(`Wrote ${manifest.seasons.length} season history shards to ${TARGET_DIR}\n`);
}

if (require.main === module) {
  shardSeasonHistory();
}

module.exports = { shardSeasonHistory };
