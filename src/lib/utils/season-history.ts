type LeadersBlock = { headers?: string[]; rows: any[] };

export type HistorySeasonEntry = {
  season: string;
  players?: {
    perGame?: LeadersBlock;
    totals?: LeadersBlock;
  };
  teams?: {
    perGame?: LeadersBlock;
    totals?: LeadersBlock;
  };
};

type HistoryManifestEntry = {
  season: string;
  file: string;
  hasData?: boolean;
};

type HistoryManifest = {
  version?: number;
  seasons: HistoryManifestEntry[];
};

type SeasonShard = {
  version?: number;
  season: string;
  entry: HistorySeasonEntry;
};

const MANIFEST_URL = '/season-history/index.json';

let manifestPromise: Promise<HistoryManifest> | null = null;
const shardPromises = new Map<string, Promise<HistorySeasonEntry | null>>();

function normalizeFileUrl(file: string): string {
  if (!file) return '';
  if (file.startsWith('http://') || file.startsWith('https://')) return file;
  return file.startsWith('/') ? file : `/${file}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'force-cache' });
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  return (await res.json()) as T;
}

export async function loadSeasonHistoryManifest(): Promise<HistoryManifest> {
  if (!manifestPromise) {
    manifestPromise = fetchJson<HistoryManifest>(MANIFEST_URL);
  }
  return manifestPromise;
}

export async function loadSeasonHistoryEntry(season: string): Promise<HistorySeasonEntry | null> {
  const manifest = await loadSeasonHistoryManifest();
  const target = manifest.seasons.find((entry) => String(entry?.season ?? '') === season);
  if (!target?.file) return null;

  const key = normalizeFileUrl(target.file);
  let promise = shardPromises.get(key);
  if (!promise) {
    promise = fetchJson<SeasonShard>(key).then((payload) => payload?.entry ?? null);
    shardPromises.set(key, promise);
  }
  return promise;
}

export async function loadAllSeasonHistoryEntries(): Promise<HistorySeasonEntry[]> {
  const manifest = await loadSeasonHistoryManifest();
  const entries = await Promise.all(
    manifest.seasons.map((entry) => loadSeasonHistoryEntry(String(entry?.season ?? '')))
  );
  return entries.filter((entry): entry is HistorySeasonEntry => Boolean(entry));
}

export async function loadAvailableHistorySeasons(currentSeason: string): Promise<string[]> {
  const manifest = await loadSeasonHistoryManifest();
  return manifest.seasons
    .filter((entry) => entry.hasData !== false)
    .map((entry) => String(entry?.season ?? ''))
    .filter(Boolean)
    .filter((season) => season !== currentSeason);
}
