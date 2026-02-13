import type { ICache } from '../cache/cache.interface';
import { expandTeamNames } from '../utils/team-matching.utils';
import { createPairKey } from '../utils/reddit.utils';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import type { 
  RedditThreadMapping,
  RedditSearchRequest,
  RedditSearchResponse,
  RedditComment,
  RedditPost
} from '../types/nba';
import type { IRedditDataSource } from './interfaces';
import type { RedditTransformer } from './reddit.transformer';

export class RedditService {
  private supabaseCache: any = null;

  constructor(
    private readonly dataSource: IRedditDataSource,
    private readonly transformer: RedditTransformer,
    private readonly cache: ICache
  ) {}

  private async getSupabaseCache() {
    if (this.supabaseCache) return this.supabaseCache;
    if (typeof window !== 'undefined') return null;

    try {
      const { SupabaseCache } = await import('../cache/supabase-cache');
      this.supabaseCache = new SupabaseCache();
      return this.supabaseCache;
    } catch (e) {
      return null;
    }
  }

  private async reportThreadToSupabase(post: RedditPost, type: 'GDT' | 'PGT', pairKey: string) {
    if (typeof window === 'undefined') return;

    try {
      const url = PUBLIC_SUPABASE_URL;
      const key = PUBLIC_SUPABASE_ANON_KEY;
      
      console.log(`[RedditService] Attempting to report thread: ${pairKey} (${type})`, { id: post.id });

      if (!url || !key) {
        console.warn('[RedditService] Missing Supabase credentials for reporting. Ensure PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY are in your .env');
        return;
      }

      const response = await fetch(`${url}/functions/v1/reddit-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          action: 'report',
          id: post.id,
          permalink: post.permalink,
          type: type,
          pair_key: pairKey
        })
      });

      if (!response.ok) {
        const text = await response.text();
        console.error(`[RedditService] Report failed (${response.status}):`, text);
      } else {
        console.log(`[RedditService] Successfully reported thread ${post.id}`);
      }
    } catch (e) {
      console.error("[RedditService] Report Exception:", e);
    }
  }

  async getRedditIndex(): Promise<RedditThreadMapping> {
    const cacheKey = 'reddit:index';
    const ttl = 10 * 60 * 1000; // 10 minutes

    // Check local cache
    const localCached = this.cache.get<RedditThreadMapping>(cacheKey);
    if (localCached && !(localCached instanceof Promise)) return localCached;

    const sb = await this.getSupabaseCache();
    if (!sb) {
      const mapping = await this.fetchAndCacheIndex(cacheKey, ttl);
      // Report found threads to Supabase if in browser
      if (typeof window !== 'undefined') {
        for (const [pairKey, entry] of Object.entries(mapping)) {
          if (entry.gdt) this.reportThreadToSupabase(entry.gdt, 'GDT', pairKey);
          if (entry.pgt) this.reportThreadToSupabase(entry.pgt, 'PGT', pairKey);
        }
      }
      return mapping;
    }

    return sb.getOrFetch(
      cacheKey,
      () => this.fetchAndCacheIndex(cacheKey, ttl),
      ttl
    );
  }

  private async fetchAndCacheIndex(cacheKey: string, ttl: number): Promise<RedditThreadMapping> {
    try {
      const searchJson = await this.dataSource.searchRaw('Daily Game Thread Index');
      const items = searchJson?.data?.children ?? [];
      const post = items.find((i: any) => i?.data?.title?.toLowerCase()?.includes('daily game thread index'));
      if (!post) return {};
      
      const threadJson = await this.dataSource.getThreadContent(post.data.permalink);
      const { mapping } = this.transformer.transformIndex(threadJson);
      
      // Update local cache
      this.cache.set(cacheKey, mapping, ttl);
      
      return mapping;
    } catch (error) {
      console.error('Error fetching Reddit Index:', error);
      return {};
    }
  }

  async searchRedditThread(request: RedditSearchRequest): Promise<RedditSearchResponse> {
    const cacheKey = `reddit:search:${JSON.stringify(request)}`;
    const ttl = 60 * 1000;
    
    // Check local cache first for speed
    const localCached = this.cache.get<RedditSearchResponse>(cacheKey);
    if (localCached && !(localCached instanceof Promise)) return localCached;

    const sb = await this.getSupabaseCache();
    if (!sb) {
      const result = await this.fetchAndCacheSearch(request, cacheKey, ttl);
      if (result.post && typeof window !== 'undefined') {
        const pairKey = createPairKey(request.awayCandidates[0], request.homeCandidates[0]);
        this.reportThreadToSupabase(result.post, request.type === 'post' ? 'PGT' : 'GDT', pairKey);
      }
      return result;
    }

    return sb.getOrFetch(
      cacheKey,
      () => this.fetchAndCacheSearch(request, cacheKey, ttl),
      ttl
    );
  }

  private async fetchAndCacheSearch(request: RedditSearchRequest, cacheKey: string, ttl: number): Promise<RedditSearchResponse> {
    try {
      const query = this.buildSearchQuery(request);
      const json = await this.dataSource.searchRaw(query);
      const result = this.transformer.transformSearch(json, request.type);
      
      // Also update local cache
      this.cache.set(cacheKey, result, ttl);
      
      return result;
    } catch (error: any) {
      // If we hit 403 or 429, try the fallback feed-based search
      if (error?.message?.includes('403') || error?.message?.includes('429')) {
        console.warn(`Reddit search failed with ${error.message}, trying feed fallback...`);
        try {
          return await this.fallbackSearchFromFeed(request);
        } catch (fallbackError) {
          console.error('Fallback search also failed:', fallbackError);
        }
      }
      
      if (error?.message?.includes('429')) {
        console.warn('Reddit search rate limited (429)');
        return { post: undefined };
      }
      throw error;
    }
  }

  private async fallbackSearchFromFeed(request: RedditSearchRequest): Promise<RedditSearchResponse> {
    // Fetch both new and hot to increase chances
    const [newFeed, hotFeed] = await Promise.all([
      this.dataSource.getSubredditFeed('nba', 'new'),
      this.dataSource.getSubredditFeed('nba', 'hot')
    ]);

    const allItems = [
      ...(newFeed?.data?.children ?? []),
      ...(hotFeed?.data?.children ?? [])
    ];

    // Deduplicate by ID
    const uniqueItemsMap = new Map();
    for (const item of allItems) {
      if (item?.data?.id) uniqueItemsMap.set(item.data.id, item);
    }
    const uniqueItems = Array.from(uniqueItemsMap.values());

    const awayExpanded = expandTeamNames(request.awayCandidates).map(t => t.toLowerCase());
    const homeExpanded = expandTeamNames(request.homeCandidates).map(t => t.toLowerCase());

    const typeFilter = (title: string) => {
      const t = title.toLowerCase();
      if (request.type === 'post') {
        return t.includes('post game thread') || t.includes('post-game thread') || t.includes('postgame thread');
      } else {
        return t.includes('game thread') && !t.includes('post game thread') && !t.includes('post-game') && !t.includes('postgame');
      }
    };

    const teamFilter = (title: string) => {
      const t = title.toLowerCase();
      const hasAway = awayExpanded.some(name => t.includes(name));
      const hasHome = homeExpanded.some(name => t.includes(name));
      return hasAway && hasHome;
    };

    const matches = uniqueItems.filter(item => {
      const title = item?.data?.title ?? '';
      return typeFilter(title) && teamFilter(title);
    });

    if (matches.length === 0) {
      return { post: undefined };
    }

    // Sort by creation time (most recent first)
    matches.sort((a, b) => (b.data.created_utc ?? 0) - (a.data.created_utc ?? 0));

    const best = matches[0].data;
    const post: RedditPost = {
      id: best.id,
      title: best.title,
      permalink: best.permalink,
      url: `https://www.reddit.com${best.permalink}`,
      created_utc: best.created_utc,
      score: best.score
    };

    return { post };
  }

  async getRedditComments(postId: string, sort: 'new' | 'top' = 'new', permalink?: string, bypassCache: boolean = false): Promise<{ comments: RedditComment[] }> {
    const cacheKey = `reddit:comments:${postId}:${sort}`;
    const ttl = sort === 'top' ? 2 * 60 * 1000 : 30 * 1000;
    
    if (bypassCache) {
      this.cache.delete(cacheKey);
      const sb = await this.getSupabaseCache();
      if (sb) await sb.delete(cacheKey);
    } else {
      // Check local cache first
      const localCached = this.cache.get<{ comments: RedditComment[] }>(cacheKey);
      if (localCached && !(localCached instanceof Promise)) return localCached;
    }
    
    const sb = await this.getSupabaseCache();
    if (!sb) {
      return this.fetchAndCacheComments(postId, sort, permalink, cacheKey, ttl);
    }

    return sb.getOrFetch(
      cacheKey,
      () => this.fetchAndCacheComments(postId, sort, permalink, cacheKey, ttl),
      ttl
    );
  }

  private async fetchAndCacheComments(postId: string, sort: string, permalink: string | undefined, cacheKey: string, ttl: number): Promise<{ comments: RedditComment[] }> {
    const json = await this.dataSource.getCommentsRaw(postId, sort, permalink);
    const result = this.transformer.transformComments(json);
    
    // Update local cache
    this.cache.set(cacheKey, result, ttl);
    
    return result;
  }

  private buildSearchQuery(request: RedditSearchRequest): string {
    const base = request.type === 'post' ? '"POST GAME THREAD"' : '"GAME THREAD"';
    const extra = request.type === 'live' ? ' -"POST GAME THREAD"' : '';
    const terms = [...request.awayCandidates, ...request.homeCandidates].map(t => `"${t}"`).join(' ');
    return `${base} ${terms}${extra}`;
  }

  clearRedditCache(): void {
    this.cache.clear(); 
  }
}
