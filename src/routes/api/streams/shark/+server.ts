import { json, type RequestHandler } from '@sveltejs/kit';

const CATEGORY_URL = 'https://sharkstreams.net/category/nba';
const CATEGORY_FETCH_TIMEOUT_MS = 7000;
const PLAYER_FETCH_TIMEOUT_MS = 5000;
const CATEGORY_CACHE_TTL_MS = 60 * 1000;
const LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://sharkstreams.net/'
};

type LookupCacheEntry = {
  ts: number;
  payload: {
    ok: boolean;
    playerUrl: string | null;
    hlsUrl: string | null;
  };
};

const categoryCache: { ts: number; html: string } = { ts: 0, html: '' };
const lookupCache = new Map<string, LookupCacheEntry>();

function sanitizeNeedle(value: string | null): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .at(-1) ?? '';
}

function normalizeText(raw: string): string {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(raw: string): string[] {
  return normalizeText(raw).split(' ').filter(Boolean);
}

function aliasSet(teamName: string, abbr: string): string[] {
  const normalizedName = normalizeText(teamName);
  const parts = words(teamName);
  const aliases = new Set<string>();
  if (normalizedName) aliases.add(normalizedName);
  if (parts.length > 0) aliases.add(parts[parts.length - 1]); // mascot
  if (parts.length > 1) aliases.add(parts.slice(0, -1).join(' ')); // city/place
  const normalizedAbbr = normalizeText(abbr);
  if (normalizedAbbr) aliases.add(normalizedAbbr);
  return Array.from(aliases).filter(Boolean);
}

function hasWord(haystack: string, needle: string): boolean {
  if (!haystack || !needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}

async function fetchTextWithTimeout(fetchFn: typeof fetch, targetUrl: string, timeoutMs: number): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchFn(targetUrl, {
      headers: BROWSER_HEADERS,
      signal: controller.signal
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeoutId);
  }
}

function normalizeUrl(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  try {
    return new URL(trimmed, CATEGORY_URL).toString();
  } catch {
    return trimmed;
  }
}

function decodeChannelSlug(playerUrl: string): string {
  try {
    const parsed = new URL(playerUrl);
    return normalizeText(parsed.searchParams.get('channel') ?? '');
  } catch {
    return '';
  }
}

function stripHtml(raw: string): string {
  return String(raw ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function scoreCandidate(
  haystack: string,
  awayAliases: string[],
  homeAliases: string[],
  awayNameNorm: string,
  homeNameNorm: string,
  awayAbbrNorm: string,
  homeAbbrNorm: string
): { score: number; awayHit: boolean; homeHit: boolean } {
  let score = 0;
  const awayHit = awayAliases.some((a) => hasWord(haystack, a));
  const homeHit = homeAliases.some((a) => hasWord(haystack, a));
  if (awayHit) score += 45;
  if (homeHit) score += 45;
  if (awayNameNorm && hasWord(haystack, awayNameNorm)) score += 25;
  if (homeNameNorm && hasWord(haystack, homeNameNorm)) score += 25;
  if (awayAbbrNorm && hasWord(haystack, awayAbbrNorm)) score += 12;
  if (homeAbbrNorm && hasWord(haystack, homeAbbrNorm)) score += 12;
  if (awayHit && homeHit) score += 20;
  return { score, awayHit, homeHit };
}

function extractPlayerUrl(
  categoryHtml: string,
  awayNeedle: string,
  homeNeedle: string,
  awayName: string,
  homeName: string,
  awayAbbr: string,
  homeAbbr: string
): string | null {
  // Preferred path: bind each listed matchup title to its nearby player link.
  const rowNameRegex = /class\s*=\s*"ch-name"[^>]*>([^<]+)<\/span>/gi;
  let rowMatch: RegExpExecArray | null;
  let bestRow: { url: string; score: number } | null = null;
  const awayAliases = Array.from(new Set([awayNeedle, ...aliasSet(awayName, awayAbbr)].filter(Boolean)));
  const homeAliases = Array.from(new Set([homeNeedle, ...aliasSet(homeName, homeAbbr)].filter(Boolean)));
  const awayNameNorm = normalizeText(awayName);
  const homeNameNorm = normalizeText(homeName);
  const awayAbbrNorm = normalizeText(awayAbbr);
  const homeAbbrNorm = normalizeText(homeAbbr);

  while ((rowMatch = rowNameRegex.exec(categoryHtml))) {
    const titleText = normalizeText(stripHtml(rowMatch[1] ?? ''));
    const scope = categoryHtml.slice(rowMatch.index, Math.min(categoryHtml.length, rowMatch.index + 1800));
    const directLink = scope.match(/onclick\s*=\s*"[^"]*'([^']*player\.php\?channel=[^']+)'[^"]*"/i);
    if (!directLink?.[1]) continue;
    const candidateUrl = normalizeUrl(directLink[1]);
    if (!candidateUrl) continue;
    const slugText = decodeChannelSlug(candidateUrl);
    const scored = scoreCandidate(
      `${titleText} ${slugText}`.trim(),
      awayAliases,
      homeAliases,
      awayNameNorm,
      homeNameNorm,
      awayAbbrNorm,
      homeAbbrNorm
    );
    if (!scored.awayHit || !scored.homeHit) continue;
    if (!bestRow || scored.score > bestRow.score) {
      bestRow = { url: candidateUrl, score: scored.score };
    }
  }

  if (bestRow && bestRow.score >= 70) {
    return bestRow.url;
  }

  // Fallback path: broader candidate scan.
  const linkRegex = /<a\b[^>]*onclick\s*=\s*"[^"]*'([^']*player\.php\?channel=[^']+)'[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
  const onclickRegex = /onclick\s*=\s*"[^"]*'([^']*player\.php\?channel=[^']+)'[^"]*"/gi;
  const bestByUrl = new Map<string, { score: number; awayHit: boolean; homeHit: boolean }>();

  function upsertCandidate(candidateUrl: string, haystack: string): void {
    const scored = scoreCandidate(
      haystack,
      awayAliases,
      homeAliases,
      awayNameNorm,
      homeNameNorm,
      awayAbbrNorm,
      homeAbbrNorm
    );
    const prev = bestByUrl.get(candidateUrl);
    if (!prev || scored.score > prev.score) {
      bestByUrl.set(candidateUrl, scored);
    }
  }

  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(categoryHtml))) {
    const candidateUrl = normalizeUrl(match[1] ?? '');
    if (!candidateUrl) continue;
    const titleText = normalizeText(stripHtml(match[2] ?? ''));
    const slugText = decodeChannelSlug(candidateUrl);
    upsertCandidate(candidateUrl, `${titleText} ${slugText}`.trim());
  }

  while ((match = onclickRegex.exec(categoryHtml))) {
    const candidateUrl = normalizeUrl(match[1] ?? '');
    if (!candidateUrl) continue;
    const idx = match.index;
    const context = categoryHtml.slice(Math.max(0, idx - 1700), Math.min(categoryHtml.length, idx + 700));
    const contextText = normalizeText(stripHtml(context));
    const slugText = decodeChannelSlug(candidateUrl);
    upsertCandidate(candidateUrl, `${contextText} ${slugText}`.trim());
  }

  let bestUrl = '';
  let bestScore = -1;
  for (const [candidateUrl, scored] of bestByUrl.entries()) {
    if (!scored.awayHit || !scored.homeHit) continue;
    if (scored.score > bestScore) {
      bestScore = scored.score;
      bestUrl = candidateUrl;
    }
  }

  if (!bestUrl || bestScore < 60) return null;
  return bestUrl;
}

function extractFirstHlsUrl(html: string): string | null {
  const primary = html.match(/https?:\/\/[^"'\s]+\.m3u8[^"'\s]*/i);
  if (primary?.[0]) return primary[0];
  const secondary = html.match(/\/\/[^"'\s]+\.m3u8[^"'\s]*/i);
  if (secondary?.[0]) return `https:${secondary[0]}`;
  return null;
}

export const GET: RequestHandler = async ({ url, fetch }) => {
  const awayNeedle = sanitizeNeedle(url.searchParams.get('away'));
  const homeNeedle = sanitizeNeedle(url.searchParams.get('home'));
  const awayName = String(url.searchParams.get('awayName') ?? '');
  const homeName = String(url.searchParams.get('homeName') ?? '');
  const awayAbbr = String(url.searchParams.get('awayAbbr') ?? '');
  const homeAbbr = String(url.searchParams.get('homeAbbr') ?? '');
  const eventId = String(url.searchParams.get('eventId') ?? '');

  if (!awayNeedle || !homeNeedle) {
    return json({ ok: false, reason: 'missing-team-query' }, { status: 400 });
  }

  const cacheKey = [
    awayNeedle,
    homeNeedle,
    normalizeText(awayName),
    normalizeText(homeName),
    normalizeText(awayAbbr),
    normalizeText(homeAbbr),
    eventId
  ].join('|');
  const cachedLookup = lookupCache.get(cacheKey);
  if (cachedLookup && (Date.now() - cachedLookup.ts) < LOOKUP_CACHE_TTL_MS) {
    return json(cachedLookup.payload);
  }

  try {
    let categoryHtml = '';
    if ((Date.now() - categoryCache.ts) < CATEGORY_CACHE_TTL_MS && categoryCache.html) {
      categoryHtml = categoryCache.html;
    } else {
      categoryHtml = await fetchTextWithTimeout(fetch, CATEGORY_URL, CATEGORY_FETCH_TIMEOUT_MS);
      categoryCache.ts = Date.now();
      categoryCache.html = categoryHtml;
    }

    const playerUrl = extractPlayerUrl(
      categoryHtml,
      awayNeedle,
      homeNeedle,
      awayName,
      homeName,
      awayAbbr,
      homeAbbr
    );
    if (!playerUrl) {
      return json({ ok: false, reason: 'no-match' });
    }

    let hlsUrl: string | null = null;
    try {
      const playerHtml = await fetchTextWithTimeout(fetch, playerUrl, PLAYER_FETCH_TIMEOUT_MS);
      hlsUrl = extractFirstHlsUrl(playerHtml);
    } catch {
      // If player page fetch fails, still return playerUrl.
    }

    const payload = {
      ok: true,
      playerUrl,
      hlsUrl: hlsUrl ? normalizeUrl(hlsUrl) : null
    };
    lookupCache.set(cacheKey, { ts: Date.now(), payload });
    return json(payload);
  } catch (error) {
    console.error('[stream][resolver] shark lookup failed', error);
    return json({ ok: false, reason: 'lookup-failed' }, { status: 502 });
  }
};
