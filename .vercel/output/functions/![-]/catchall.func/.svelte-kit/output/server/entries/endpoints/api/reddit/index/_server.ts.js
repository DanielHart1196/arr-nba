import { R as RedditDataSource } from "../../../../../chunks/reddit.datasource.js";
import { R as RedditService, a as RedditTransformer, b as apiCache } from "../../../../../chunks/reddit.service.js";
const dataSource = new RedditDataSource();
const transformer = new RedditTransformer();
const redditService = new RedditService(dataSource, transformer, apiCache);
const GET = async () => {
  try {
    const mapping = await redditService.getRedditIndex();
    return new Response(JSON.stringify({ mapping }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (error) {
    console.error("Reddit Index API Route Error:", error);
    return new Response(JSON.stringify({
      mapping: {},
      error: error?.message || "Unknown error"
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
};
export {
  GET
};
