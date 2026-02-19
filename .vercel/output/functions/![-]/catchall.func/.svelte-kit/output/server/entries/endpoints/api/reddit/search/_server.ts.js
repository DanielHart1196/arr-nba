import { R as RedditDataSource } from "../../../../../chunks/reddit.datasource.js";
import { R as RedditService, a as RedditTransformer, b as apiCache } from "../../../../../chunks/reddit.service.js";
const dataSource = new RedditDataSource();
const transformer = new RedditTransformer();
const redditService = new RedditService(dataSource, transformer, apiCache);
const POST = async ({ request }) => {
  try {
    const body = await request.json();
    if (body.query) {
      const json = await dataSource.searchRaw(body.query);
      return new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } });
    }
    const payload = await redditService.searchRedditThread(body);
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  } catch (error) {
    console.error("Reddit search error:", error);
    return new Response(JSON.stringify({
      post: null,
      error: error?.message || "Unknown error"
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
};
export {
  POST
};
