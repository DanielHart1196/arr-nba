import { json, type RequestHandler } from '@sveltejs/kit';

const CATEGORY_URL = 'https://sharkstreams.net/category/nba';
const FETCH_TIMEOUT_MS = 9000;
const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: 'https://sharkstreams.net/'
};

function sanitizeNeedle(value: string | null): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .at(-1) ?? '';
}

async function fetchTextWithTimeout(fetchFn: typeof fetch, targetUrl: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
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

function extractPlayerUrl(categoryHtml: string, awayNeedle: string, homeNeedle: string): string | null {
  const linkRegex = /onclick\s*=\s*"[^"]*'([^']*player\.php\?channel=[^']+)'[^"]*"/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRegex.exec(categoryHtml))) {
    const candidateUrl = normalizeUrl(match[1] ?? '');
    if (!candidateUrl) continue;

    const idx = match.index;
    const context = categoryHtml.slice(Math.max(0, idx - 1600), Math.min(categoryHtml.length, idx + 500));
    const contextText = context
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase();

    if (contextText.includes(awayNeedle) && contextText.includes(homeNeedle)) {
      return candidateUrl;
    }
  }
  return null;
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

  if (!awayNeedle || !homeNeedle) {
    return json({ ok: false, reason: 'missing-team-query' }, { status: 400 });
  }

  try {
    const categoryHtml = await fetchTextWithTimeout(fetch, CATEGORY_URL);
    const playerUrl = extractPlayerUrl(categoryHtml, awayNeedle, homeNeedle);
    if (!playerUrl) {
      return json({ ok: false, reason: 'no-match' });
    }

    let hlsUrl: string | null = null;
    try {
      const playerHtml = await fetchTextWithTimeout(fetch, playerUrl);
      hlsUrl = extractFirstHlsUrl(playerHtml);
    } catch {
      // If player page fetch fails, still return playerUrl.
    }

    return json({
      ok: true,
      playerUrl,
      hlsUrl: hlsUrl ? normalizeUrl(hlsUrl) : null
    });
  } catch (error) {
    console.error('[stream][resolver] shark lookup failed', error);
    return json({ ok: false, reason: 'lookup-failed' }, { status: 502 });
  }
};
