import { RedditDataSource } from '$lib/services/reddit.datasource';
import { RedditTransformer } from '$lib/services/reddit.transformer';
import { RedditService } from '$lib/services/reddit.service';
import { apiCache } from '$lib/cache/api-cache';

const dataSource = new RedditDataSource();
const transformer = new RedditTransformer();
const redditService = new RedditService(dataSource, transformer, apiCache);
const CACHE_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'public, max-age=30, s-maxage=120, stale-while-revalidate=600'
};
const NO_STORE_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store'
};

export const GET = async () => {
  try {
    const mapping = await redditService.getRedditIndex();
    return new Response(JSON.stringify({ mapping }), { status: 200, headers: CACHE_HEADERS });
  } catch (error: any) {
    console.error('Reddit Index API Route Error:', error);
    return new Response(JSON.stringify({ 
      mapping: {},
      error: error?.message || 'Unknown error'
    }), { status: 200, headers: NO_STORE_HEADERS });
  }
};
