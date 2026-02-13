import { RedditDataSource } from '$lib/services/reddit.datasource';

const dataSource = new RedditDataSource();

export const GET = async ({ params, url }: any) => {
  const subreddit = params.subreddit;
  const sort = (url.searchParams.get('sort') || 'new') as 'new' | 'hot';
  
  try {
    const json = await dataSource.getSubredditFeed(subreddit, sort);
    return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (error: any) {
    console.error(`Subreddit API Route Error (${subreddit}):`, error);
    return new Response(JSON.stringify({ 
      data: { children: [] }, 
      error: error?.message || 'Unknown error'
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
};
