class APICache {
  cache = /* @__PURE__ */ new Map();
  defaultTTL = 5 * 60 * 1e3;
  // 5 minutes
  maxEntries = 400;
  set(key, data, ttl = this.defaultTTL) {
    if (!this.cache.has(key) && this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }
  pendingRequests = /* @__PURE__ */ new Map();
  async getOrFetch(key, fetcher, ttl) {
    const cached = this.get(key);
    if (cached !== null) return cached;
    const pending = this.pendingRequests.get(key);
    if (pending) return pending;
    const promise = fetcher().then((data) => {
      this.set(key, data, ttl);
      this.pendingRequests.delete(key);
      return data;
    }).catch((err) => {
      this.pendingRequests.delete(key);
      throw err;
    });
    this.pendingRequests.set(key, promise);
    return promise;
  }
  clear() {
    this.cache.clear();
  }
  delete(key) {
    return this.cache.delete(key);
  }
  size() {
    return this.cache.size;
  }
  // Cleanup expired entries
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}
const apiCache = new APICache();
class RedditTransformer {
  transformSearch(json, type) {
    const items = json?.data?.children ?? [];
    const now = Date.now() / 1e3;
    const maxAge = type === "post" ? 36 * 3600 : 24 * 3600;
    const fresh = items.filter((i) => now - (i?.data?.created_utc ?? now) <= maxAge);
    const filtered = fresh.filter((i) => {
      const title = (i?.data?.title || "").toLowerCase();
      const isPGT = title.includes("post game thread") || title.includes("post-game thread") || title.includes("postgame thread");
      if (type === "post") {
        return isPGT;
      } else {
        return title.includes("game thread") && !isPGT;
      }
    });
    const sorted = filtered.sort((a, b) => (b.data?.created_utc ?? 0) - (a.data?.created_utc ?? 0));
    const mapped = sorted.map((i) => ({
      id: i?.data?.id,
      title: i?.data?.title,
      permalink: i?.data?.permalink,
      url: `https://www.reddit.com${i?.data?.permalink}`,
      created_utc: i?.data?.created_utc,
      score: i?.data?.score
    }));
    return { post: mapped[0] || null };
  }
  transformComments(json) {
    if (!json || !Array.isArray(json)) {
      console.error("Reddit Transformer: Invalid JSON structure for comments:", JSON.stringify(json)?.slice(0, 200));
      return { comments: [] };
    }
    const commentsData = json[1];
    if (!commentsData) {
      console.warn("Reddit Transformer: No comments data found in json[1]");
    }
    return { comments: this.toTree(commentsData) };
  }
  transformIndex(json) {
    const selfText = json?.[0]?.data?.children?.[0]?.data?.selftext ?? "";
    const lines = selfText.split("\n");
    const mapping = {};
    for (const line of lines) {
      const m = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/.exec(line);
      if (!m) continue;
      const title = m[1];
      const url = m[2];
      const isPGT = title.toLowerCase().includes("post game thread");
      const parts = title.split(":")[1]?.trim() ?? title;
      const [awayPart, homePart] = parts.split(" at ").map((s) => s?.trim());
      if (!awayPart || !homePart) continue;
      const key = [this.mascotName(awayPart), this.mascotName(homePart)].sort().join("|");
      const idMatch = /comments\/([a-z0-9]+)\//.exec(url);
      const id = idMatch?.[1] ?? "";
      mapping[key] = mapping[key] || {};
      const post = { id, title, url };
      if (isPGT) {
        mapping[key].pgt = post;
      } else {
        mapping[key].gdt = post;
      }
    }
    const knicksKey = ["Knicks", "76ers"].sort().join("|");
    if (!mapping[knicksKey]?.pgt) ;
    return { mapping };
  }
  mascotName(name) {
    const n = (name || "").toLowerCase();
    const mascots = [
      "trail blazers",
      "knicks",
      "76ers",
      "lakers",
      "celtics",
      "warriors",
      "nets",
      "raptors",
      "bulls",
      "cavaliers",
      "pistons",
      "pacers",
      "bucks",
      "heat",
      "magic",
      "hawks",
      "hornets",
      "wizards",
      "mavericks",
      "rockets",
      "grizzlies",
      "pelicans",
      "spurs",
      "nuggets",
      "timberwolves",
      "suns",
      "kings",
      "clippers",
      "thunder",
      "jazz",
      "blazers"
    ];
    for (const m of mascots) {
      if (n.includes(m)) {
        if (m === "blazers" || m === "trail blazers") return "Trail Blazers";
        return m.split(" ").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
      }
    }
    return name;
  }
  toTree(json, depth = 0) {
    if (!json || !json.data || !json.data.children) {
      if (depth === 0) {
        console.warn("Reddit Transformer: toTree called with invalid structure:", JSON.stringify(json)?.slice(0, 200));
      }
      return [];
    }
    const arr = json.data.children;
    const nodes = [];
    for (const i of arr) {
      const d = i?.data;
      if (i?.kind !== "t1") continue;
      const node = {
        id: d?.id,
        author: d?.author,
        score: d?.score ?? 0,
        body: d?.body ?? "",
        created_utc: d?.created_utc ?? 0
      };
      if (depth < 2 && d?.replies && typeof d.replies === "object") {
        node.replies = this.toTree(d.replies, depth + 1);
      }
      nodes.push(node);
    }
    return nodes;
  }
}
class RedditService {
  constructor(dataSource, transformer, cache) {
    this.dataSource = dataSource;
    this.transformer = transformer;
    this.cache = cache;
  }
  readBrowserCache(key, maxAgeMs) {
    if (typeof window === "undefined") return null;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.ts !== "number") return null;
      if (Date.now() - parsed.ts > maxAgeMs) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }
  writeBrowserCache(key, data) {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
    } catch {
    }
  }
  async getRedditIndex() {
    const cacheKey = "reddit:index";
    const localCached = this.cache.get(cacheKey);
    if (localCached && !(localCached instanceof Promise)) return localCached;
    const browserCached = this.readBrowserCache(cacheKey, 10 * 60 * 1e3);
    if (browserCached) {
      this.cache.set(cacheKey, browserCached, 6e5);
      return browserCached;
    }
    try {
      let searchJson;
      try {
        searchJson = await this.dataSource.searchRaw("Daily Game Thread Index");
      } catch (e) {
        if (e.message.includes("403") || e.message.includes("429")) {
          console.warn("Reddit Index search blocked, falling back to hot feed");
          searchJson = await this.dataSource.getSubredditFeed("nba", "hot");
        } else {
          throw e;
        }
      }
      const items = searchJson?.data?.children ?? [];
      const sortedItems = items.sort((a, b) => (b.data?.created_utc ?? 0) - (a.data?.created_utc ?? 0));
      const post = sortedItems.find((i) => i?.data?.title?.toLowerCase()?.includes("daily game thread index"));
      if (!post) {
        if (items.length > 0 && !items.some((i) => i?.data?.title?.toLowerCase()?.includes("daily game thread index"))) {
          const hotFeed = await this.dataSource.getSubredditFeed("nba", "hot");
          const hotPost = hotFeed?.data?.children?.find((i) => i?.data?.title?.toLowerCase()?.includes("daily game thread index"));
          if (hotPost) return this.processIndexPost(hotPost.data, cacheKey);
        }
        return {};
      }
      return this.processIndexPost(post.data, cacheKey);
    } catch (error) {
      console.error("Error fetching Reddit Index:", error);
      return {};
    }
  }
  async processIndexPost(indexPost, cacheKey) {
    const threadJson = await this.dataSource.getThreadContent(indexPost.permalink);
    const { mapping } = this.transformer.transformIndex(threadJson);
    this.cache.set(cacheKey, mapping, 6e5);
    this.writeBrowserCache(cacheKey, mapping);
    return mapping;
  }
  async searchRedditThread(request) {
    const query = this.buildSearchQuery(request);
    let json;
    try {
      json = await this.dataSource.searchRaw(query);
    } catch (e) {
      if (e.message.includes("403") || e.message.includes("429")) {
        console.warn("Reddit search blocked, falling back to feed-based search");
        return this.fallbackSearchFromFeed(request);
      }
      throw e;
    }
    const result = this.transformer.transformSearch(json, request.type);
    return result;
  }
  async fallbackSearchFromFeed(request) {
    try {
      const [newFeed, hotFeed] = await Promise.all([
        this.dataSource.getSubredditFeed("nba", "new"),
        this.dataSource.getSubredditFeed("nba", "hot")
      ]);
      const allPosts = [
        ...newFeed?.data?.children ?? [],
        ...hotFeed?.data?.children ?? []
      ];
      const seen = /* @__PURE__ */ new Set();
      const uniquePosts = allPosts.filter((p) => {
        if (seen.has(p.data.id)) return false;
        seen.add(p.data.id);
        return true;
      });
      const wrappedJson = { data: { children: uniquePosts } };
      return this.transformer.transformSearch(wrappedJson, request.type === "post" ? "post" : "live");
    } catch (e) {
      console.error("Fallback feed search failed:", e);
      return { post: void 0 };
    }
  }
  async getRedditComments(postId, sort = "new", permalink, bypassCache = false) {
    const cacheKey = `reddit:comments:${postId}:${sort}`;
    const ttl = sort === "top" ? 12e4 : 3e4;
    const local = this.cache.get(cacheKey);
    if (local && !(local instanceof Promise) && !bypassCache) return local;
    if (!bypassCache) {
      const browserCached = this.readBrowserCache(cacheKey, ttl);
      if (browserCached) {
        this.cache.set(cacheKey, browserCached, ttl);
        return browserCached;
      }
    }
    const json = await this.dataSource.getCommentsRaw(postId, sort, permalink);
    const result = this.transformer.transformComments(json);
    this.cache.set(cacheKey, result, ttl);
    this.writeBrowserCache(cacheKey, result);
    return result;
  }
  buildSearchQuery(request) {
    const base = request.type === "post" ? '"POST GAME THREAD"' : '"GAME THREAD"';
    const terms = [...request.awayCandidates, ...request.homeCandidates].map((t) => `"${t}"`).join(" ");
    const extra = request.type === "live" ? ' -"POST GAME THREAD"' : "";
    return `${base} ${terms}${extra}`;
  }
  clearRedditCache() {
    this.cache.clear();
  }
}
export {
  RedditService as R,
  RedditTransformer as a,
  apiCache as b
};
