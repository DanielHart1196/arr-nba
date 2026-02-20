import { RedditDataSource } from '$lib/services/reddit.datasource';
import { RedditTransformer } from '$lib/services/reddit.transformer';
import { RedditService } from '$lib/services/reddit.service';
import { apiCache } from '$lib/cache/api-cache';
import { dev } from '$app/environment';

const dataSource = new RedditDataSource();
const transformer = new RedditTransformer();
const redditService = new RedditService(dataSource, transformer, apiCache);

function cacheHeaders(ttlSeconds: number) {
  return {
    'content-type': 'application/json',
    'cache-control': `public, max-age=15, s-maxage=${ttlSeconds}, stale-while-revalidate=${ttlSeconds * 8}`
  };
}

const NO_STORE_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store'
};

export const GET = async ({ params, url }: any) => {
  const id = params.postId;
  const sort = url.searchParams.get('sort') || 'new';
  const permalink = url.searchParams.get('permalink') || '';
  const bypassCache = url.searchParams.get('bypassCache') === 'true' || url.searchParams.has('_refresh');
  const ttlSeconds = sort === 'top' ? 120 : 30;
  const headers = bypassCache ? NO_STORE_HEADERS : cacheHeaders(ttlSeconds);
  
  try {
    // If we have a permalink and the postId is 'none', it's a request for thread content
    if (id === 'none' && permalink) {
      const json = await dataSource.getThreadContent(permalink);
      return new Response(JSON.stringify(json), { status: 200, headers });
    }

    // If we have a permalink, use it to fetch comments from Reddit
    if (permalink) {
      const json = await dataSource.getCommentsRaw(id, sort, permalink);
      return new Response(JSON.stringify(json), { status: 200, headers });
    }

    const value = await redditService.getRedditComments(id, sort, permalink, bypassCache);
    return new Response(JSON.stringify(value), { status: 200, headers });
  } catch (error: any) {
    console.error('Reddit API Route Error:', error);
    return new Response(JSON.stringify({ 
      comments: [], 
      error: error?.message || 'Unknown error',
      stack: dev ? error?.stack : undefined
    }), { status: 200, headers: NO_STORE_HEADERS });
  }
};
