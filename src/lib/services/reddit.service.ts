import type { ICache } from '../cache/cache.interface';
import { expandTeamNames } from '../utils/team-matching.utils';
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
      },
      60 * 1000 // 1 minute TTL for search
    );
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
