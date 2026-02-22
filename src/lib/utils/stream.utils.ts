export type ResolvedStream = {
  label: string;
  url: string;
  mode: 'video' | 'embed' | 'external';
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

export async function findSharkStreamByTeams(
  awayDisplayName: string,
  homeDisplayName: string
): Promise<ResolvedStream | null> {
  if (!awayDisplayName || !homeDisplayName) return null;
  if (typeof DOMParser === 'undefined') return null;

  const awayNeedle = pickLastToken(awayDisplayName);
  const homeNeedle = pickLastToken(homeDisplayName);
  if (!awayNeedle || !homeNeedle) return null;

  try {
    const proxy = 'https://api.allorigins.win/get?url=';
    const target = encodeURIComponent('https://sharkstreams.net/category/nba');
    const res = await fetch(`${proxy}${target}`);
    if (!res.ok) return null;
    const json = await res.json();
    const html = typeof json?.contents === 'string' ? json.contents : '';
    if (!html) return null;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const rows = Array.from(doc.querySelectorAll('.row'));
    const match = rows.find((row) => {
      const text = (row.textContent || '').toLowerCase();
      return text.includes(awayNeedle) && text.includes(homeNeedle);
    });
    if (!match) return null;

    const watchBtn = match.querySelector('.hd-link') as HTMLElement | null;
    const onclick = watchBtn?.getAttribute('onclick') || '';
    const urlMatch = onclick.match(/'([^']+player\.php\?channel=[^']+)'/);
    const url = urlMatch?.[1];
    if (!url) return null;

    return {
      label: 'Watch Live (SharkStreams)',
      url,
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
