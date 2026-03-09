import { isNativeRuntime, resolveApiUrl } from '$lib/utils/runtime';

export type ResolvedStream = {
  label: string;
  url: string;
  mode: 'video' | 'embed' | 'external';
};

export type StreamLookupOptions = {
  awayAbbr?: string;
  homeAbbr?: string;
  eventId?: string;
};

export const STREAM_FALLBACK: ResolvedStream = {
  label: 'Stream (Fallback)',
  url: 'https://sharkstreams.net/category/nba',
  mode: 'embed'
};

function pickLastToken(value: string): string {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .at(-1) ?? '';
}

type SharkApiResponse = {
  ok?: boolean;
  playerUrl?: string | null;
  hlsUrl?: string | null;
};

async function fetchSharkLookup(url: string): Promise<SharkApiResponse | null> {
  if (isNativeRuntime()) {
    const { CapacitorHttp } = await import('@capacitor/core');
    const response = await CapacitorHttp.request({
      method: 'GET',
      url,
      headers: { Accept: 'application/json' },
      connectTimeout: 12000,
      readTimeout: 12000
    });
    if (response.status < 200 || response.status >= 300) return null;
    return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
  }

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

function toPlayableHlsUrl(hlsUrl: string): string {
  if (!hlsUrl) return hlsUrl;
  try {
    const parsed = new URL(hlsUrl);
    const host = parsed.hostname.toLowerCase();
    if (host === 'zafiles.cfd' || host.endsWith('.zafiles.cfd')) {
      return `${resolveApiUrl('/api/hls-proxy')}?url=${encodeURIComponent(hlsUrl)}`;
    }
  } catch {
    // Keep original URL if parsing fails.
  }
  return hlsUrl;
}

export async function findSharkStreamByTeams(
  awayDisplayName: string,
  homeDisplayName: string,
  options?: StreamLookupOptions
): Promise<ResolvedStream | null> {
  if (!awayDisplayName || !homeDisplayName) return null;

  const awayNeedle = pickLastToken(awayDisplayName);
  const homeNeedle = pickLastToken(homeDisplayName);
  if (!awayNeedle || !homeNeedle) return null;

  try {
    const apiUrl =
      `${resolveApiUrl('/api/streams/shark')}` +
      `?away=${encodeURIComponent(awayNeedle)}` +
      `&home=${encodeURIComponent(homeNeedle)}` +
      `&awayName=${encodeURIComponent(awayDisplayName)}` +
      `&homeName=${encodeURIComponent(homeDisplayName)}` +
      `&awayAbbr=${encodeURIComponent(options?.awayAbbr ?? '')}` +
      `&homeAbbr=${encodeURIComponent(options?.homeAbbr ?? '')}` +
      `&eventId=${encodeURIComponent(options?.eventId ?? '')}`;
    const lookup = await fetchSharkLookup(apiUrl);
    const playerUrl = typeof lookup?.playerUrl === 'string' ? lookup.playerUrl : '';
    const hlsUrl = typeof lookup?.hlsUrl === 'string' ? lookup.hlsUrl : '';
    if (!playerUrl && !hlsUrl) return null;

    if (hlsUrl) {
      return {
        label: 'Watch Live (HLS)',
        url: toPlayableHlsUrl(hlsUrl),
        mode: 'video'
      };
    }

    return {
      label: 'Watch Live (SharkStreams)',
      url: playerUrl,
      mode: 'embed'
    };
  } catch {
    return null;
  }
}

export async function resolveHlsFromPlayerUrl(playerUrl: string): Promise<string | null> {
  if (!playerUrl) return null;
  if (typeof DOMParser === 'undefined') return null;
  try {
    const proxy = 'https://api.allorigins.win/get?url=';
    const target = encodeURIComponent(playerUrl);
    const res = await fetch(`${proxy}${target}`);
    if (!res.ok) return null;
    const json = await res.json();
    const html = typeof json?.contents === 'string' ? json.contents : '';
    if (!html) return null;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const scripts = Array.from(doc.querySelectorAll('script')).map((s) => s.textContent || '').join('\n');
    const combined = `${html}\n${scripts}`;
    const match = combined.match(/https?:\/\/[^"'\\s]+\\.m3u8[^"'\\s]*/i);
    if (match?.[0]) return match[0];
    const altMatch = combined.match(/\/\/[^"'\s]+\.m3u8[^"'\s]*/i);
    if (altMatch?.[0]) return `https:${altMatch[0]}`;
    return null;
  } catch {
    return null;
  }
}
