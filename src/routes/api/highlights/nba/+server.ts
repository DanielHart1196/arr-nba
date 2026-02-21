import type { RequestHandler } from '@sveltejs/kit';

const JSON_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store'
};

function parseLimit(value: string | null): number {
  const parsed = Number(value ?? 8);
  if (!Number.isFinite(parsed)) return 8;
  return Math.max(1, Math.min(12, Math.trunc(parsed)));
}

function extractVideoIds(html: string, max: number): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    /"videoId":"([a-zA-Z0-9_-]{11})"/g,
    /\/watch\?v=([a-zA-Z0-9_-]{11})/g
  ];

  for (const re of patterns) {
    let match: RegExpExecArray | null = null;
    while ((match = re.exec(html)) && out.length < max) {
      const id = match[1];
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    if (out.length >= max) break;
  }
  return out;
}

async function getOembedTitle(videoId: string): Promise<string | null> {
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`;
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0'
    }
  });
  if (!response.ok) return null;
  try {
    const data = await response.json();
    return typeof data?.title === 'string' && data.title.trim().length > 0 ? data.title.trim() : null;
  } catch {
    return null;
  }
}

export const GET: RequestHandler = async ({ url }) => {
  const query = (url.searchParams.get('query') || 'nba full game highlights').trim();
  const limit = parseLimit(url.searchParams.get('limit'));
  console.log('[highlights][api] request', { query, limit });

  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ%253D%253D`;
    const searchResponse = await fetch(searchUrl, {
      headers: {
        'accept-language': 'en-US,en;q=0.9',
        'cookie': 'CONSENT=YES+cb.20210328-17-p0.en+FX+123',
        'user-agent': 'Mozilla/5.0'
      }
    });
    if (!searchResponse.ok) {
      console.log('[highlights][api] youtube search non-ok', { query, status: searchResponse.status });
      return new Response(JSON.stringify({ videos: [], error: `youtube search failed: ${searchResponse.status}` }), {
        status: 200,
        headers: JSON_HEADERS
      });
    }

    const html = await searchResponse.text();
    const candidateIds = extractVideoIds(html, Math.max(limit * 4, 20));
    console.log('[highlights][api] extracted candidate IDs', {
      query,
      count: candidateIds.length,
      sample: candidateIds.slice(0, 5)
    });
    const videos: Array<{ id: string; title: string }> = [];

    for (const id of candidateIds) {
      if (videos.length >= limit) break;
      try {
        const title = await getOembedTitle(id);
        videos.push({ id, title: title || `YouTube Highlight ${videos.length + 1}` });
      } catch {
        videos.push({ id, title: `YouTube Highlight ${videos.length + 1}` });
      }
    }

    console.log('[highlights][api] response videos', {
      query,
      count: videos.length,
      sample: videos.slice(0, 3).map((v) => ({ id: v.id, title: v.title }))
    });

    return new Response(JSON.stringify({ videos }), {
      status: 200,
      headers: JSON_HEADERS
    });
  } catch (error: any) {
    console.log('[highlights][api] exception', { query, error: error?.message ?? 'unknown error' });
    return new Response(JSON.stringify({ videos: [], error: error?.message ?? 'unknown error' }), {
      status: 200,
      headers: JSON_HEADERS
    });
  }
};
