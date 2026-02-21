import { apiCache } from '../cache/api-cache';
import { ESPNDataSource } from './espn.datasource';
import { ESPNBasketTransformer } from './espn.transformer';
import { RedditDataSource } from './reddit.datasource';
import { RedditTransformer } from './reddit.transformer';
import { NBAService as NBAServiceV2 } from './nba.service.v2';
import { RedditService } from './reddit.service';
import type { 
  ScoreboardResponse, 
  BoxscoreResponse, 
  RedditThreadMapping,
  RedditSearchRequest,
  RedditSearchResponse,
  RedditComment,
  RedditPost
} from '../types/nba';

// Maintain the same export name and singleton for backward compatibility
// but delegate to the new SOLID implementations.
export class NBAService {
  private nbaService: NBAServiceV2;
  private redditService: RedditService;

  constructor() {
    const espnDataSource = new ESPNDataSource();
    const basketTransformer = new ESPNBasketTransformer();
    const redditDataSource = new RedditDataSource();
    const redditTransformer = new RedditTransformer();
    
    this.nbaService = new NBAServiceV2(espnDataSource, basketTransformer, apiCache);
    this.redditService = new RedditService(redditDataSource, redditTransformer, apiCache);
  }

  async getScoreboard(date?: string, forceRefresh: boolean = false): Promise<ScoreboardResponse> {
    return this.nbaService.getScoreboard(date, forceRefresh);
  }

  async getBoxscore(eventId: string): Promise<BoxscoreResponse> {
    return this.nbaService.getBoxscore(eventId);
  }

  async getStandings(forceRefresh: boolean = false): Promise<any> {
    return this.nbaService.getStandings(forceRefresh);
  }

  getCachedBoxscore(eventId: string): BoxscoreResponse | null {
    return this.nbaService.getCachedBoxscore(eventId);
  }

  async getRedditIndex(): Promise<RedditThreadMapping> {
    return this.redditService.getRedditIndex();
  }

  async searchRedditThread(request: RedditSearchRequest): Promise<RedditSearchResponse> {
    return this.redditService.searchRedditThread(request);
  }

  async searchSubredditThread(subreddit: string, request: RedditSearchRequest): Promise<RedditSearchResponse> {
    return this.redditService.searchSubredditThread(subreddit, request);
  }

  getCachedThreadForEvent(eventId: string, type: 'live' | 'post') {
    return this.redditService.getCachedThreadForEvent(eventId, type);
  }

  async getDailyIndexPostForDate(eventDate?: string): Promise<RedditPost | null> {
    return this.redditService.getDailyIndexPostForDate(eventDate);
  }

  async getRedditComments(postId: string, sort: 'new' | 'top' = 'new', permalink?: string, bypassCache: boolean = false): Promise<{ comments: RedditComment[] }> {
    return this.redditService.getRedditComments(postId, sort, permalink, bypassCache);
  }

  async prewarmBoxscores(eventIds: string[]): Promise<void> {
    return this.nbaService.prewarmBoxscores(eventIds);
  }

  async prewarmScoreboards(dates: string[]): Promise<void> {
    return this.nbaService.prewarmScoreboards(dates);
  }

  clearRedditCache(): void {
    this.redditService.clearRedditCache();
  }

  async forceRefreshReddit(): Promise<void> {
    this.clearRedditCache();
  }

  cleanupCache(): void {
    this.nbaService.cleanupCache();
  }
}

// Singleton instance
export const nbaService = new NBAService();
