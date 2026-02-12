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

  async getRedditIndex(): Promise<RedditThreadMapping> {
    return this.cache.getOrFetch(
      'reddit:index',
      async () => {
        try {
          const searchJson = await this.dataSource.searchRaw('Daily Game Thread Index');
          const items = searchJson?.data?.children ?? [];
          const post = items.find((i: any) => i?.data?.title?.toLowerCase()?.includes('daily game thread index'));
          if (!post) return {};
          
          const threadJson = await this.dataSource.getThreadContent(post.data.permalink);
          const { mapping } = this.transformer.transformIndex(threadJson);
          return mapping;
        } catch (error) {
          console.error('Error fetching Reddit Index:', error);
          return {};
        }
      },
      10 * 60 * 1000 // 10 minutes TTL
    );
  }

  async searchRedditThread(request: RedditSearchRequest): Promise<RedditSearchResponse> {
    const cacheKey = `reddit:search:${JSON.stringify(request)}`;
    
    return this.cache.getOrFetch(
      cacheKey,
      async () => {
        try {
          const query = this.buildSearchQuery(request);
          const json = await this.dataSource.searchRaw(query);
          return this.transformer.transformSearch(json, request.type);
        } catch (error: any) {
          // If we hit rate limit, return empty and let it be cached for a shorter time 
          // to avoid immediate retries that worsen the 429
          if (error?.message?.includes('429')) {
            console.warn('Reddit search rate limited (429)');
            return { post: undefined };
          }
          throw error;
        }
      },
      60 * 1000 // 1 minute TTL for search
    );
  }

  async getRedditComments(postId: string, sort: 'new' | 'top' = 'new', permalink?: string, bypassCache: boolean = false): Promise<{ comments: RedditComment[] }> {
    const cacheKey = `reddit:comments:${postId}:${sort}`;
    const ttl = sort === 'top' ? 2 * 60 * 1000 : 30 * 1000;
    
    if (bypassCache) {
      this.cache.delete(cacheKey);
    }
    
    return this.cache.getOrFetch(
      cacheKey,
      async () => {
        const json = await this.dataSource.getCommentsRaw(postId, sort, permalink);
        return this.transformer.transformComments(json);
      },
      ttl
    );
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
