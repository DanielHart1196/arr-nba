import { RedditDataSource } from '$lib/services/reddit.datasource';
import { RedditTransformer } from '$lib/services/reddit.transformer';
import { RedditService } from '$lib/services/reddit.service';
import { apiCache } from '$lib/cache/api-cache';

const dataSource = new RedditDataSource();
const transformer = new RedditTransformer();
const redditService = new RedditService(dataSource, transformer, apiCache);

export const POST = async ({ request }: any) => {
  try {
    const body = await request.json();
    
    // If it's a direct search query from our new client-side RedditDataSource
    if (body.query) {
      const json = await dataSource.searchRaw(body.query);
      return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    const payload = await redditService.searchRedditThread(body);
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (error: any) {
    console.error('Reddit search error:', error);
    return new Response(JSON.stringify({ 
      post: null,
      error: error?.message || 'Unknown error'
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
};
