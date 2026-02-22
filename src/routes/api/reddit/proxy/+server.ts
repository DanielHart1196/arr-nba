import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.reddit.com/',
};

const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(targetUrl: string): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(targetUrl, {
      headers: BROWSER_HEADERS,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function withRawJson(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.searchParams.has('raw_json')) parsed.searchParams.set('raw_json', '1');
    return parsed.toString();
  } catch {
    return url;
  }
}

function toOldReddit(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hostname = 'old.reddit.com';
    return parsed.toString();
  } catch {
    return url;
  }
}

export const GET: RequestHandler = async ({ url }) => {
  const targetUrl = url.searchParams.get('url');
  
  if (!targetUrl) {
    throw error(400, 'Missing url parameter');
  }

  // Basic security check: only allow reddit urls
  if (!targetUrl.includes('reddit.com')) {
    throw error(403, 'Only reddit.com URLs are allowed');
  }

  const primaryUrl = withRawJson(targetUrl);
  const fallbackUrl = withRawJson(toOldReddit(targetUrl));

  try {
    let response = await fetchWithTimeout(primaryUrl);

    if (!response.ok && fallbackUrl !== primaryUrl) {
      console.warn(`Reddit proxy primary failed ${response.status}, retrying old.reddit.com`);
      response = await fetchWithTimeout(fallbackUrl);
    }

    if (!response.ok) {
      console.error(`Vercel Bridge Proxy Error: ${response.status} for ${primaryUrl}`);
      return new Response(await response.text(), {
        status: response.status,
        headers: {
          'content-type': 'text/plain',
          'cache-control': 'no-store'
        }
      });
    }

    const data = await response.json();
    const ttlSeconds = targetUrl.includes('/comments/') ? 30 : 60;
    return json(data, {
      headers: {
        'cache-control': `public, max-age=20, s-maxage=${ttlSeconds}, stale-while-revalidate=${ttlSeconds * 10}`
      }
    });
  } catch (err) {
    console.error('Vercel Bridge Proxy Exception:', err);
    throw error(504, 'Bridge failed to fetch');
  }
};
