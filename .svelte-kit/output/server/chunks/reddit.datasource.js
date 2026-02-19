class RedditDataSource {
  BASE_URL = "/api/reddit";
  USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 (arr-nba app)";
  async getIndex() {
    if (typeof window !== "undefined") {
      const res = await fetch(`${this.BASE_URL}/index`);
      if (!res.ok) throw new Error(`Reddit Index error: ${res.status}`);
      return res.json();
    } else {
      const url = "https://www.reddit.com/r/nba/search.json?q=Daily%20Game%20Thread%20Index&restrict_sr=1&sort=new";
      console.log(`Fetching Reddit index from: ${url}`);
      const res = await fetch(url, {
        headers: {
          "User-Agent": this.USER_AGENT,
          "Accept": "application/json"
        }
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`Reddit Index error ${res.status}: ${text.slice(0, 100)}`);
        throw new Error(`Reddit Index error: ${res.status}`);
      }
      return res.json();
    }
  }
  async searchRaw(query) {
    if (typeof window !== "undefined") {
      const res = await fetch(`${this.BASE_URL}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query })
      });
      if (!res.ok) throw new Error(`Reddit Search error: ${res.status}`);
      return res.json();
    } else {
      const url = `https://www.reddit.com/r/nba/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=new&t=week`;
      console.log(`Searching Reddit with: ${url}`);
      const res = await fetch(url, {
        headers: {
          "User-Agent": this.USER_AGENT,
          "Accept": "application/json"
        }
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`Reddit Search error ${res.status}: ${text.slice(0, 100)}`);
        throw new Error(`Reddit Search error: ${res.status}`);
      }
      return res.json();
    }
  }
  async getCommentsRaw(postId, sort, permalink) {
    if (typeof window !== "undefined") {
      const url = new URL(`${window.location.origin}${this.BASE_URL}/comments/${postId}`);
      url.searchParams.set("sort", sort);
      if (permalink) url.searchParams.set("permalink", permalink);
      const res = await fetch(url.toString());
      if (!res.ok) {
        console.warn(`Reddit Comments API Route error ${res.status}, trying direct fetch...`);
        const directUrl = permalink ? `https://www.reddit.com${permalink}.json?sort=${sort}` : `https://www.reddit.com/comments/${postId}.json?sort=${sort}`;
        const directRes = await fetch(directUrl);
        if (!directRes.ok) throw new Error(`Reddit Comments direct error: ${directRes.status}`);
        return directRes.json();
      }
      return res.json();
    } else {
      const target = permalink ? `https://www.reddit.com${permalink}.json?sort=${sort}` : `https://www.reddit.com/comments/${postId}.json?sort=${sort}`;
      console.log(`Fetching Reddit comments from: ${target}`);
      const res = await fetch(target, {
        headers: {
          "User-Agent": this.USER_AGENT,
          "Accept": "application/json"
        }
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`Reddit Comments error ${res.status}: ${text.slice(0, 100)}`);
        throw new Error(`Reddit Comments error: ${res.status}`);
      }
      return res.json();
    }
  }
  async getThreadContent(permalink) {
    if (typeof window !== "undefined") {
      const url = new URL(`${window.location.origin}${this.BASE_URL}/comments/none`);
      url.searchParams.set("permalink", permalink);
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Reddit Thread Content error: ${res.status}`);
      return res.json();
    } else {
      const url = `https://www.reddit.com${permalink}.json`;
      console.log(`Fetching Reddit thread content from: ${url}`);
      const res = await fetch(url, {
        headers: {
          "User-Agent": this.USER_AGENT,
          "Accept": "application/json"
        }
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`Reddit Thread Content error ${res.status}: ${text.slice(0, 100)}`);
        throw new Error(`Reddit Thread Content error: ${res.status}`);
      }
      return res.json();
    }
  }
  async getSubredditFeed(subreddit, sort = "new") {
    if (typeof window !== "undefined") {
      const res = await fetch(`${this.BASE_URL}/subreddit/${subreddit}?sort=${sort}`);
      if (!res.ok) throw new Error(`Reddit Subreddit Feed error: ${res.status}`);
      return res.json();
    } else {
      const url = `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=100`;
      console.log(`Fetching Reddit subreddit feed from: ${url}`);
      const res = await fetch(url, {
        headers: {
          "User-Agent": this.USER_AGENT,
          "Accept": "application/json"
        }
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`Reddit Subreddit Feed error ${res.status}: ${text.slice(0, 100)}`);
        throw new Error(`Reddit Subreddit Feed error: ${res.status}`);
      }
      return res.json();
    }
  }
  async fetchRaw(url) {
    const options = {};
    if (typeof window === "undefined") {
      options.headers = { "User-Agent": this.USER_AGENT };
    }
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`Reddit fetchRaw error: ${res.status}`);
    return res.json();
  }
}
export {
  RedditDataSource as R
};
