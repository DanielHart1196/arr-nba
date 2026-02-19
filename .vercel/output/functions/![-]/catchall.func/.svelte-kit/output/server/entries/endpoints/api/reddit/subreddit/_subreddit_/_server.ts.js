import { R as RedditDataSource } from "../../../../../../chunks/reddit.datasource.js";
const dataSource = new RedditDataSource();
const GET = async ({ params, url }) => {
  const subreddit = params.subreddit;
  const sort = url.searchParams.get("sort") || "new";
  try {
    const json = await dataSource.getSubredditFeed(subreddit, sort);
    return new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } });
  } catch (error) {
    console.error(`Subreddit API Route Error (${subreddit}):`, error);
    return new Response(JSON.stringify({
      data: { children: [] },
      error: error?.message || "Unknown error"
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
};
export {
  GET
};
