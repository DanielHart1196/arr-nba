import type { IRedditDataSource } from './interfaces';
import type { RedditPost, RedditComment, RedditSearchRequest } from '$lib/types/nba';

export class RedditDataSource implements IRedditDataSource {
  private readonly BASE_URL = '/api/reddit';
  private readonly USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 (arr-nba app)';
  private readonly JSON_HEADERS = { 'Accept': 'application/json' };

  private isBrowser(): boolean {
    return typeof window !== 'undefined';
  }

  private async fetchJson(url: string, init?: RequestInit): Promise<any> {
    const res = await fetch(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  private async fetchRedditServer(url: string, context: string): Promise<any> {
    console.log(`Fetching ${context} from: ${url}`);
    const res = await fetch(url, {
      headers: {
        'User-Agent': this.USER_AGENT,
        ...this.JSON_HEADERS
      }
    });
    if (!res.ok) {
      const text = await res.text();
      console.error(`${context} error ${res.status}: ${text.slice(0, 100)}`);
      throw new Error(`${context} error: ${res.status}`);
    }
    return res.json();
  }

  private async fetchViaProxy(url: string, context: string): Promise<any> {
    const proxyUrl = `${this.BASE_URL}/proxy?url=${encodeURIComponent(url)}`;
    const res = await fetch(proxyUrl, { headers: this.JSON_HEADERS });
    if (!res.ok) throw new Error(`${context} proxy error: ${res.status}`);
    return res.json();
  }

  private async fetchRedditBrowserFirst(url: string, context: string): Promise<any> {
    try {
      // Proxy-first avoids browser CORS and Reddit 429 from direct frontend hits.
      return await this.fetchViaProxy(url, context);
    } catch (error: any) {
      console.warn(`${context} proxy fetch failed, falling back to direct:`, error?.message ?? error);
      return this.fetchJson(url, { headers: this.JSON_HEADERS });
    }
  }

  async getIndex(): Promise<any> {
    const url = 'https://www.reddit.com/r/nba/search.json?q=Daily%20Game%20Thread%20Index&restrict_sr=1&sort=new';
    if (this.isBrowser()) return this.fetchRedditBrowserFirst(url, 'Reddit Index');
    return this.fetchRedditServer(url, 'Reddit Index');
  }

  async searchRaw(
    query: string,
    timeRange: 'day' | 'week' | 'month' | 'year' | 'all' = 'week',
    sort: 'new' | 'relevance' = 'new'
  ): Promise<any> {
    const url = `https://www.reddit.com/r/nba/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=${sort}&t=${timeRange}`;
    if (this.isBrowser()) return this.fetchRedditBrowserFirst(url, 'Reddit Search');
    return this.fetchRedditServer(url, 'Reddit Search');
  }

  async getCommentsRaw(postId: string, sort: string, permalink?: string): Promise<any> {
    const target = permalink
      ? `https://www.reddit.com${permalink}.json?sort=${sort}`
      : `https://www.reddit.com/comments/${postId}.json?sort=${sort}`;
    if (this.isBrowser()) return this.fetchRedditBrowserFirst(target, 'Reddit Comments');
    return this.fetchRedditServer(target, 'Reddit Comments');
  }

  async getThreadContent(permalink: string): Promise<any> {
    const url = `https://www.reddit.com${permalink}.json`;
    if (this.isBrowser()) return this.fetchRedditBrowserFirst(url, 'Reddit Thread Content');
    return this.fetchRedditServer(url, 'Reddit Thread Content');
  }

  async getSubredditFeed(subreddit: string, sort: 'new' | 'hot' = 'new'): Promise<any> {
    const url = `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=100`;
    if (this.isBrowser()) return this.fetchRedditBrowserFirst(url, 'Reddit Subreddit Feed');
    return this.fetchRedditServer(url, 'Reddit Subreddit Feed');
  }

  async fetchRaw(url: string): Promise<any> {
    const options: RequestInit = {};
    if (!this.isBrowser()) {
      options.headers = { 'User-Agent': this.USER_AGENT };
    }
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`Reddit fetchRaw error: ${res.status}`);
    return res.json();
  }
}
