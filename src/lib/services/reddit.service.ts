import type { ICache } from '../cache/cache.interface';
import type { 
  RedditThreadMapping,
  RedditSearchRequest,
  RedditSearchResponse,
  RedditComment
} from '../types/nba';
import type { IRedditDataSource } from './interfaces';
import type { RedditTransformer } from './reddit.transformer';

export class RedditService {
  constructor(
    private readonly dataSource: IRedditDataSource,
    private readonly transformer: RedditTransformer,
    private readonly cache: ICache
  ) {}

  private readBrowserCache<T>(key: string, maxAgeMs: number): T | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { ts: number; data: T };
      if (!parsed || typeof parsed.ts !== 'number') return null;
      if (Date.now() - parsed.ts > maxAgeMs) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }

  private writeBrowserCache<T>(key: string, data: T): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
    } catch {}
  }

  async getRedditIndex(): Promise<RedditThreadMapping> {
    const cacheKey = 'reddit:index';
    const localCached = this.cache.get<RedditThreadMapping>(cacheKey);
    if (localCached && !(localCached instanceof Promise)) return localCached;
    const browserCached = this.readBrowserCache<RedditThreadMapping>(cacheKey, 10 * 60 * 1000);
    if (browserCached) {
      this.cache.set(cacheKey, browserCached, 600000);
      return browserCached;
    }

    try {
      let searchJson: any;
      try {
        searchJson = await this.dataSource.searchRaw('Daily Game Thread Index');
      } catch (e: any) {
        if (e.message.includes('403') || e.message.includes('429')) {
          console.warn('Reddit Index search blocked, falling back to hot feed');
          searchJson = await this.dataSource.getSubredditFeed('nba', 'hot');
        } else {
          throw e;
        }
      }

      const items = searchJson?.data?.children ?? [];
      
      // Look for the absolute newest index post
      const sortedItems = items.sort((a: any, b: any) => (b.data?.created_utc ?? 0) - (a.data?.created_utc ?? 0));
      const post = sortedItems.find((i: any) => i?.data?.title?.toLowerCase()?.includes('daily game thread index'));
      
      if (!post) {
        // One last try: if we tried search and it returned nothing (but not error), try hot
        if (items.length > 0 && !items.some((i: any) => i?.data?.title?.toLowerCase()?.includes('daily game thread index'))) {
           const hotFeed = await this.dataSource.getSubredditFeed('nba', 'hot');
           const hotPost = hotFeed?.data?.children?.find((i: any) => i?.data?.title?.toLowerCase()?.includes('daily game thread index'));
           if (hotPost) return this.processIndexPost(hotPost.data, cacheKey);
        }
        return {};
      }
      
      return this.processIndexPost(post.data, cacheKey);
    } catch (error) {
      console.error('Error fetching Reddit Index:', error);
      return {};
    }
  }

  private async processIndexPost(indexPost: any, cacheKey: string): Promise<RedditThreadMapping> {
    const threadJson = await this.dataSource.getThreadContent(indexPost.permalink);
    const { mapping } = this.transformer.transformIndex(threadJson);
    this.cache.set(cacheKey, mapping, 600000);
    this.writeBrowserCache(cacheKey, mapping);
    return mapping;
  }

  async searchRedditThread(request: RedditSearchRequest): Promise<RedditSearchResponse> {
    const query = this.buildSearchQuery(request);
    let json: any;
    try {
      json = await this.dataSource.searchRaw(query);
    } catch (e: any) {
      if (e.message.includes('403') || e.message.includes('429')) {
        console.warn('Reddit search blocked, falling back to feed-based search');
        return this.fallbackSearchFromFeed(request);
      }
      throw e;
    }

    const result = this.transformer.transformSearch(json, request.type);
    return result;
  }

  private async fallbackSearchFromFeed(request: RedditSearchRequest): Promise<RedditSearchResponse> {
    try {
      // Fetch both 'new' and 'hot' to increase chances of finding it
      const [newFeed, hotFeed] = await Promise.all([
        this.dataSource.getSubredditFeed('nba', 'new'),
        this.dataSource.getSubredditFeed('nba', 'hot')
      ]);

      const allPosts = [
        ...(newFeed?.data?.children ?? []),
        ...(hotFeed?.data?.children ?? [])
      ];

      // Deduplicate by ID
      const seen = new Set();
      const uniquePosts = allPosts.filter((p: any) => {
        if (seen.has(p.data.id)) return false;
        seen.add(p.data.id);
        return true;
      });

      // Wrap in a structure that transformer expects
      const wrappedJson = { data: { children: uniquePosts } };
      return this.transformer.transformSearch(wrappedJson, request.type === 'post' ? 'post' : 'live');
    } catch (e) {
      console.error('Fallback feed search failed:', e);
      return { post: undefined };
    }
  }

  async getRedditComments(postId: string, sort: 'new' | 'top' = 'new', permalink?: string, bypassCache: boolean = false): Promise<{ comments: RedditComment[] }> {
    const cacheKey = `reddit:comments:${postId}:${sort}`;
    const ttl = sort === 'top' ? 120000 : 30000;
    
    // 1. Check local in-memory cache
    const local = this.cache.get<{ comments: RedditComment[] }>(cacheKey);
    if (local && !(local instanceof Promise) && !bypassCache) return local;
    if (!bypassCache) {
      const browserCached = this.readBrowserCache<{ comments: RedditComment[] }>(cacheKey, ttl);
      if (browserCached) {
        this.cache.set(cacheKey, browserCached, ttl);
        return browserCached;
      }
    }

    // 2. Fetch fresh data from Reddit
    const json = await this.dataSource.getCommentsRaw(postId, sort, permalink);
    const result = this.transformer.transformComments(json);
    
    // 3. Update local cache
    this.cache.set(cacheKey, result, ttl);
    this.writeBrowserCache(cacheKey, result);

    return result;
  }

  private buildSearchQuery(request: RedditSearchRequest): string {
    const base = request.type === 'post' ? '"POST GAME THREAD"' : '"GAME THREAD"';
    const terms = [...request.awayCandidates, ...request.homeCandidates].map(t => `"${t}"`).join(' ');
    const extra = request.type === 'live' ? ' -"POST GAME THREAD"' : '';
    return `${base} ${terms}${extra}`;
  }

  clearRedditCache(): void { this.cache.clear(); }
}
