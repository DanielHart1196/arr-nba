import { RedditDataSource } from '$lib/services/reddit.datasource';

const dataSource = new RedditDataSource();

function cacheHeaders(sort: 'new' | 'hot') {
  const ttlSeconds = sort === 'hot' ? 60 : 30;
  return {
    'content-type': 'application/json',
    'cache-control': `public, max-age=20, s-maxage=${ttlSeconds}, stale-while-revalidate=${ttlSeconds * 10}`
  };
}

const NO_STORE_HEADERS = {
  'content-type': 'application/json',
  'cache-control': 'no-store'
};

export const GET = async ({ params, url }: any) => {
  const subreddit = params.subreddit;
  const sort = (url.searchParams.get('sort') || 'new') as 'new' | 'hot';
  
  try {
    const json = await dataSource.getSubredditFeed(subreddit, sort);
    return new Response(JSON.stringify(json), { status: 200, headers: cacheHeaders(sort) });
  } catch (error: any) {
    console.error(`Subreddit API Route Error (${subreddit}):`, error);
    return new Response(JSON.stringify({ 
      data: { children: [] }, 
      error: error?.message || 'Unknown error'
    }), { status: 200, headers: NO_STORE_HEADERS });
  }
};
