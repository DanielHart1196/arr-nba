import { RedditDataSource } from '$lib/services/reddit.datasource';
import { RedditTransformer } from '$lib/services/reddit.transformer';
import { RedditService } from '$lib/services/reddit.service';
import { apiCache } from '$lib/cache/api-cache';

const dataSource = new RedditDataSource();
const transformer = new RedditTransformer();
const redditService = new RedditService(dataSource, transformer, apiCache);

export const GET = async ({ params, url }: any) => {
  const id = params.postId;
  const sort = url.searchParams.get('sort') || 'new';
  const permalink = url.searchParams.get('permalink') || '';
  const bypassCache = url.searchParams.get('bypassCache') === 'true' || url.searchParams.has('_refresh');
  
  try {
    // If we have a permalink and the postId is 'none', it's a request for thread content
    if (id === 'none' && permalink) {
      const json = await dataSource.getThreadContent(permalink);
      return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    // If we have a permalink, use it to fetch comments from Reddit
    if (permalink) {
      const json = await dataSource.getCommentsRaw(id, sort, permalink);
      return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
    }

    const value = await redditService.getRedditComments(id, sort, permalink, bypassCache);
    return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ comments: [] }), { status: 200 });
  }
};
