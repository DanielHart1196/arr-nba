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
  constructor(
    private readonly dataSource: IRedditDataSource,
    private readonly transformer: RedditTransformer,
    private readonly cache: ICache
  ) {}

  // Helper to save Reddit data to Supabase from the browser
  private async saveToSupabase(key: string, data: any, ttlMs: number) {
    if (typeof window === 'undefined') return;
    try {
      const url = PUBLIC_SUPABASE_URL;
      const anonKey = PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !anonKey) return;

      const expires_at = new Date(Date.now() + ttlMs).toISOString();
      
      // Use Supabase REST API directly from browser
      await fetch(`${url}/rest/v1/reddit_cache`, {
        method: 'POST',
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({ key, data, expires_at, updated_at: new Date().toISOString() })
      });
    } catch (e) { console.error("Failed global cache update:", e); }
  }

  // Report thread discovery to Supabase via Edge Function
  private async reportThreadToSupabase(post: RedditPost, type: 'GDT' | 'PGT', pairKey: string) {
    if (typeof window === 'undefined') return;
    try {
      const url = PUBLIC_SUPABASE_URL;
      const key = PUBLIC_SUPABASE_ANON_KEY;
      if (!url || !key) return;

      fetch(`${url}/functions/v1/reddit-sync`, {
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
      }).catch(() => {});
    } catch (e) {}
  }

  async getRedditIndex(): Promise<RedditThreadMapping> {
    const cacheKey = 'reddit:index';
    const localCached = this.cache.get<RedditThreadMapping>(cacheKey);
    if (localCached && !(localCached instanceof Promise)) return localCached;

    try {
      const searchJson = await this.dataSource.searchRaw('Daily Game Thread Index');
      const items = searchJson?.data?.children ?? [];
      const post = items.find((i: any) => i?.data?.title?.toLowerCase()?.includes('daily game thread index'));
      if (!post) return {};
      
      const threadJson = await this.dataSource.getThreadContent(post.data.permalink);
      const { mapping } = this.transformer.transformIndex(threadJson);
      this.cache.set(cacheKey, mapping, 600000);

      // Report found threads to Supabase if in browser
      if (typeof window !== 'undefined') {
        for (const [pairKey, entry] of Object.entries(mapping)) {
          if (entry.gdt) this.reportThreadToSupabase(entry.gdt, 'GDT', pairKey);
          if (entry.pgt) this.reportThreadToSupabase(entry.pgt, 'PGT', pairKey);
        }
      }
      return mapping;
    } catch (error) {
      console.error('Error fetching Reddit Index:', error);
      return {};
    }
  }

  async searchRedditThread(request: RedditSearchRequest): Promise<RedditSearchResponse> {
    const query = this.buildSearchQuery(request);
    const json = await this.dataSource.searchRaw(query);
    const result = this.transformer.transformSearch(json, request.type);

    if (result.post && typeof window !== 'undefined') {
      const pairKey = createPairKey(request.awayCandidates[0], request.homeCandidates[0]);
      this.reportThreadToSupabase(result.post, request.type === 'post' ? 'PGT' : 'GDT', pairKey);
    }

    return result;
  }

  async getRedditComments(postId: string, sort: 'new' | 'top' = 'new', permalink?: string, bypassCache: boolean = false): Promise<{ comments: RedditComment[] }> {
    const cacheKey = `reddit:comments:${postId}:${sort}`;
    const ttl = sort === 'top' ? 120000 : 30000;
    
    // 1. Check local memory
    const local = this.cache.get<{ comments: RedditComment[] }>(cacheKey);
    if (local && !(local instanceof Promise) && !bypassCache) return local;

    // 2. Check Supabase (Client-side fetch)
    if (typeof window !== 'undefined' && !bypassCache) {
      try {
        const res = await fetch(`${PUBLIC_SUPABASE_URL}/rest/v1/reddit_cache?key=eq.${cacheKey}&select=data,updated_at`, {
          headers: { 'apikey': PUBLIC_SUPABASE_ANON_KEY, 'Authorization': `Bearer ${PUBLIC_SUPABASE_ANON_KEY}` }
        });
        const rows = await res.json();
        const row = rows[0];
        
        // If data is fresh (< 30s old), use it!
        if (row && (Date.now() - new Date(row.updated_at).getTime() < 30000)) {
          const result = this.transformer.transformComments(row.data);
          this.cache.set(cacheKey, result, ttl);
          return result;
        }
      } catch (e) { console.warn("Supabase fetch failed, falling back to Reddit"); }
    }

    // 3. Fetch from Reddit (Browser is not blocked!)
    const json = await this.dataSource.getCommentsRaw(postId, sort, permalink);
    const result = this.transformer.transformComments(json);
    
    // 4. Update local and Supabase cache for everyone else
    this.cache.set(cacheKey, result, ttl);
    this.saveToSupabase(cacheKey, json, 3600000); // Save raw JSON to global cache

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
