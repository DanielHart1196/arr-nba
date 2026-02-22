import type { RequestHandler } from './$types';

const ALLOWED_HOST_SUFFIX = 'zafiles.cfd';

function isAllowedUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return url.hostname === ALLOWED_HOST_SUFFIX || url.hostname.endsWith(`.${ALLOWED_HOST_SUFFIX}`);
  } catch {
    return false;
  }
}

function makeAbsoluteUrl(base: string, ref: string): string {
  try {
    return new URL(ref, base).toString();
  } catch {
    return ref;
  }
}

function proxyUrlFor(target: string): string {
  return `/api/hls-proxy?url=${encodeURIComponent(target)}`;
}

function rewritePlaylist(playlist: string, baseUrl: string): string {
  return playlist
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        if (trimmed.includes('URI="')) {
          return line.replace(/URI="([^"]+)"/g, (_m, uri) => {
            const abs = makeAbsoluteUrl(baseUrl, uri);
            return `URI="${proxyUrlFor(abs)}"`;
          });
        }
        return line;
      }
      const abs = makeAbsoluteUrl(baseUrl, trimmed);
      return proxyUrlFor(abs);
    })
    .join('\n');
}

export const GET: RequestHandler = async ({ url, fetch }) => {
  const target = url.searchParams.get('url') || '';
  if (!target || !isAllowedUrl(target)) {
    return new Response('Invalid target', { status: 400 });
  }

  let res: Response;
  try {
    const targetUrl = new URL(target);
    res = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Referer: `${targetUrl.origin}/`
      }
    });
  } catch {
    return new Response('Upstream fetch failed', { status: 502 });
  }

  if (!res.ok) {
    return new Response(`Upstream error ${res.status}`, { status: 502 });
  }

  const contentType = res.headers.get('content-type') || '';
  const isPlaylist = target.toLowerCase().includes('.m3u8') || contentType.includes('application/vnd.apple.mpegurl');

  if (!isPlaylist) {
    return new Response(res.body, {
      status: 200,
      headers: {
        'content-type': contentType || 'application/octet-stream',
        'cache-control': 'no-store'
      }
    });
  }

  const text = await res.text();
  const rewritten = rewritePlaylist(text, target);

  return new Response(rewritten, {
    status: 200,
    headers: {
      'content-type': 'application/vnd.apple.mpegurl',
      'cache-control': 'no-store'
    }
  });
};
