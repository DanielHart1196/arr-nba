import type { ICache } from '../cache/cache.interface';
import type { 
  RedditThreadMapping,
  RedditSearchRequest,
  RedditSearchResponse,
  RedditComment,
  RedditPost
} from '../types/nba';
import type { IRedditDataSource } from './interfaces';
import type { RedditTransformer } from './reddit.transformer';
import { createPairKey } from '$lib/utils/reddit.utils';
import { idbGet, idbSet } from '$lib/cache/indexeddb-cache';

export class RedditService {
  private readonly commentsRefreshCooldownMs = 15 * 1000;
  private readonly commentsRefreshTracker = new Map<string, number>();

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

  private refreshCommentsInBackground(
    cacheKey: string,
    postId: string,
    sort: 'new' | 'top',
    permalink: string | undefined,
    ttl: number
  ): void {
    if (typeof window === 'undefined') return;
    const now = Date.now();
    const last = this.commentsRefreshTracker.get(cacheKey) ?? 0;
    if (now - last < this.commentsRefreshCooldownMs) return;
    this.commentsRefreshTracker.set(cacheKey, now);

    (async () => {
      try {
        const json = await this.dataSource.getCommentsRaw(postId, sort, permalink);
        const result = this.transformer.transformComments(json);
        this.cache.set(cacheKey, result, ttl);
        await idbSet(cacheKey, result);
      } catch {
        // Background refresh failure should not disrupt cached viewing.
      }
    })();
  }

  private eventThreadCacheKey(eventId: string): string {
    return `reddit:eventThreads:${eventId}`;
  }

  private readEventThreadCache(eventId: string): { live?: RedditPost; post?: RedditPost } | null {
    if (!eventId || typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(this.eventThreadCacheKey(eventId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { live?: RedditPost; post?: RedditPost };
      return parsed ?? null;
    } catch {
      return null;
    }
  }

  private writeEventThreadCache(eventId: string, type: 'live' | 'post', post: RedditPost): void {
    if (!eventId || typeof window === 'undefined' || !post?.id) return;
    try {
      const current = this.readEventThreadCache(eventId) ?? {};
      const next = type === 'post' ? { ...current, post } : { ...current, live: post };
      localStorage.setItem(this.eventThreadCacheKey(eventId), JSON.stringify(next));
    } catch {}
  }

  getCachedThreadForEvent(eventId: string, type: 'live' | 'post'): RedditPost | null {
    const cached = this.readEventThreadCache(eventId);
    if (!cached) return null;
    return type === 'post' ? (cached.post ?? null) : (cached.live ?? null);
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

  async getRedditIndexForDate(eventDate?: string): Promise<RedditThreadMapping> {
    if (!eventDate) return {};
    const ts = new Date(eventDate).getTime();
    if (!Number.isFinite(ts)) return {};
    const dayKey = new Date(ts).toISOString().slice(0, 10);
    const cacheKey = `reddit:index:${dayKey}`;

    const localCached = this.cache.get<RedditThreadMapping>(cacheKey);
    if (localCached && !(localCached instanceof Promise)) return localCached;
    const browserCached = this.readBrowserCache<RedditThreadMapping>(cacheKey, 24 * 60 * 60 * 1000);
    if (browserCached) {
      this.cache.set(cacheKey, browserCached, 24 * 60 * 60 * 1000);
      return browserCached;
    }

    try {
      const searchJson = await this.dataSource.searchRaw('Game Thread Index', 'year');
      const items = searchJson?.data?.children ?? [];
      const indexCandidates = items
        .map((i: any) => i?.data)
        .filter((d: any) => (d?.title ?? '').toLowerCase().includes('game thread index'));
      if (indexCandidates.length === 0) return {};

      const targetUtc = Math.floor(ts / 1000);
      const nearest = indexCandidates
        .sort((a: any, b: any) => Math.abs((a?.created_utc ?? 0) - targetUtc) - Math.abs((b?.created_utc ?? 0) - targetUtc))[0];
      if (!nearest?.permalink) return {};

      const mapping = await this.processIndexPost(nearest, cacheKey);
      return mapping;
    } catch (error) {
      console.error('Error fetching dated Reddit Index:', error);
      return {};
    }
  }

  async getDailyIndexPostForDate(eventDate?: string): Promise<RedditPost | null> {
    if (!eventDate) return null;
    const ts = new Date(eventDate).getTime();
    if (!Number.isFinite(ts)) return null;

    const dayKey = new Date(ts).toISOString().slice(0, 10);
    const cacheKey = `reddit:index:post:${dayKey}`;
    const localCached = this.cache.get<RedditPost | null>(cacheKey);
    if (localCached && !(localCached instanceof Promise)) return localCached;
    const browserCached = this.readBrowserCache<RedditPost | null>(cacheKey, 24 * 60 * 60 * 1000);
    if (browserCached) {
      this.cache.set(cacheKey, browserCached, 24 * 60 * 60 * 1000);
      return browserCached;
    }

    try {
      const searchJson = await this.dataSource.searchRaw('Daily Game Thread Index', 'year');
      const items = (searchJson?.data?.children ?? [])
        .map((i: any) => i?.data)
        .filter((d: any) => {
          const t = String(d?.title ?? '').toLowerCase();
          return t.includes('daily game thread index');
        });
      if (items.length === 0) return null;

      const target = new Date(ts);
      const monthName = target.toLocaleString('en-US', { month: 'long' }).toLowerCase();
      const day = target.getDate();
      const year = target.getFullYear();
      const dayPattern = new RegExp(`\\b${monthName}\\s+${day}\\b.*\\b${year}\\b`, 'i');
      const titleMatches = items.filter((d: any) => dayPattern.test(String(d?.title ?? '').toLowerCase()));

      const targetUtc = Math.floor(ts / 1000);
      const pool = titleMatches.length > 0 ? titleMatches : items;
      const best = pool.sort((a: any, b: any) => {
        const aDist = Math.abs((a?.created_utc ?? 0) - targetUtc);
        const bDist = Math.abs((b?.created_utc ?? 0) - targetUtc);
        return aDist - bDist;
      })[0];
      if (!best) return null;

      const post: RedditPost = {
        id: best?.id ?? '',
        title: best?.title ?? '',
        permalink: best?.permalink ?? '',
        url: best?.permalink ? `https://www.reddit.com${best.permalink}` : (best?.url ?? ''),
        created_utc: best?.created_utc ?? undefined,
        score: best?.score ?? undefined
      };

      this.cache.set(cacheKey, post, 24 * 60 * 60 * 1000);
      this.writeBrowserCache(cacheKey, post);
      return post;
    } catch (error) {
      console.error('Error fetching daily index post for date:', error);
      return null;
    }
  }

  async searchRedditThread(request: RedditSearchRequest): Promise<RedditSearchResponse> {
    if (request.eventDate) {
      try {
        const datedMapping = await this.getRedditIndexForDate(request.eventDate);
        const pairKey = createPairKey(request.awayCandidates[0] ?? '', request.homeCandidates[0] ?? '');
        const entry = datedMapping?.[pairKey];
        if (entry) {
          const post = request.type === 'post' ? entry.pgt : entry.gdt;
          if (post) {
            if (request.eventId) {
              this.writeEventThreadCache(request.eventId, request.type, post);
            }
            return { post };
          }
        }
      } catch {}
    }

    const query = this.buildSearchQuery(request);
    const eventTs = request.eventDate ? new Date(request.eventDate).getTime() : NaN;
    const hasEventDate = Number.isFinite(eventTs);
    const eventAgeDays = hasEventDate ? Math.abs((Date.now() - eventTs) / (24 * 60 * 60 * 1000)) : 0;
    const timeRange: 'week' | 'month' | 'year' = !hasEventDate
      ? (request.type === 'post' ? 'year' : 'month')
      : (eventAgeDays > 45 ? 'year' : (eventAgeDays > 7 ? 'month' : 'week'));
    const sort: 'new' | 'relevance' = request.type === 'post' ? 'relevance' : 'new';
    let json: any;
    try {
      json = await this.dataSource.searchRaw(query, timeRange, sort);
    } catch (e: any) {
      if (e.message.includes('403') || e.message.includes('429')) {
        console.warn('Reddit search blocked, falling back to feed-based search');
        return this.fallbackSearchFromFeed(request);
      }
      throw e;
    }

    const result = this.transformer.transformSearch(
      json,
      request.type,
      request.eventDate,
      request.awayCandidates,
      request.homeCandidates
    );
    if (result?.post && request.eventId) {
      this.writeEventThreadCache(request.eventId, request.type, result.post);
    }
    return result;
  }

  async searchSubredditThread(subreddit: string, request: RedditSearchRequest): Promise<RedditSearchResponse> {
    const sub = (subreddit || '').trim().toLowerCase();
    if (!sub) return { post: undefined };

    const cacheKey = `reddit:subthread:${sub}:${request.type}:${createPairKey(request.awayCandidates?.[0] ?? '', request.homeCandidates?.[0] ?? '')}:${request.eventDate ?? ''}`;
    const cached = this.cache.get<RedditSearchResponse>(cacheKey);
    if (cached && !(cached instanceof Promise)) return cached;

    try {
      const [newFeed, hotFeed] = await Promise.all([
        this.dataSource.getSubredditFeed(sub, 'new'),
        this.dataSource.getSubredditFeed(sub, 'hot')
      ]);

      const allPosts = [
        ...(newFeed?.data?.children ?? []),
        ...(hotFeed?.data?.children ?? [])
      ];

      const seen = new Set<string>();
      const uniquePosts = allPosts.filter((post: any) => {
        const id = String(post?.data?.id ?? '');
        if (!id || seen.has(id)) return false;
        seen.add(id);
        return true;
      });

      const wrappedJson = { data: { children: uniquePosts } };
      const result = this.transformer.transformSearch(
        wrappedJson,
        request.type,
        request.eventDate,
        request.awayCandidates,
        request.homeCandidates
      );

      this.cache.set(cacheKey, result, request.type === 'post' ? 120000 : 30000);
      return result;
    } catch (error) {
      console.error(`Subreddit thread search failed for r/${sub}:`, error);
      return { post: undefined };
    }
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
      const result = this.transformer.transformSearch(
        wrappedJson,
        request.type === 'post' ? 'post' : 'live',
        request.eventDate,
        request.awayCandidates,
        request.homeCandidates
      );
      if (result?.post && request.eventId) {
        this.writeEventThreadCache(request.eventId, request.type, result.post);
      }
      return result;
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
      // Stale-first from IndexedDB: instant return for previously viewed threads.
      const persisted = await idbGet<{ comments: RedditComment[] }>(cacheKey);
      if (persisted?.value) {
        this.cache.set(cacheKey, persisted.value, ttl);
        this.refreshCommentsInBackground(cacheKey, postId, sort, permalink, ttl);
        return persisted.value;
      }
    }

    // 2. Fetch fresh data from Reddit
    const json = await this.dataSource.getCommentsRaw(postId, sort, permalink);
    const result = this.transformer.transformComments(json);
    
    // 3. Update local cache
    this.cache.set(cacheKey, result, ttl);
    await idbSet(cacheKey, result);

    return result;
  }

  private buildSearchQuery(request: RedditSearchRequest): string {
    const base = request.type === 'post' ? '"POST GAME THREAD"' : '"GAME THREAD"';
    const terms = [...request.awayCandidates, ...request.homeCandidates].map(t => `"${t}"`).join(' ');
    const extra = request.type === 'live' ? ' -"POST GAME THREAD"' : '';
    // Date token helps PGT relevance, but hurts LIVE because game-thread titles rarely include YYYY-MM-DD.
    const dateToken = request.type === 'post' && request.eventDate ? ` "${request.eventDate}"` : '';
    return `${base} ${terms}${dateToken}${extra}`;
  }

  clearRedditCache(): void { this.cache.clear(); }
}
