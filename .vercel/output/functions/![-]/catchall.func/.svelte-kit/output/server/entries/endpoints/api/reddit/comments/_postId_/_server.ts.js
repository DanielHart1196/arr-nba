import { R as RedditDataSource } from "../../../../../../chunks/reddit.datasource.js";
import { R as RedditService, a as RedditTransformer, b as apiCache } from "../../../../../../chunks/reddit.service.js";
const dataSource = new RedditDataSource();
const transformer = new RedditTransformer();
const redditService = new RedditService(dataSource, transformer, apiCache);
const GET = async ({ params, url }) => {
  const id = params.postId;
  const sort = url.searchParams.get("sort") || "new";
  const permalink = url.searchParams.get("permalink") || "";
  const bypassCache = url.searchParams.get("bypassCache") === "true" || url.searchParams.has("_refresh");
  try {
    if (id === "none" && permalink) {
      const json = await dataSource.getThreadContent(permalink);
      return new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (permalink) {
      const json = await dataSource.getCommentsRaw(id, sort, permalink);
      return new Response(JSON.stringify(json), { status: 200, headers: { "content-type": "application/json" } });
    }
    const value = await redditService.getRedditComments(id, sort, permalink, bypassCache);
    return new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
  } catch (error) {
    console.error("Reddit API Route Error:", error);
    return new Response(JSON.stringify({
      comments: [],
      error: error?.message || "Unknown error",
      stack: process.env.NODE_ENV === "development" ? error?.stack : void 0
    }), { status: 200, headers: { "content-type": "application/json" } });
  }
};
export {
  GET
};
