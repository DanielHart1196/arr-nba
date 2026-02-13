import type { ScoreboardResponse, BoxscoreResponse, RedditPost, RedditComment, RedditSearchRequest } from '$lib/types/nba';

export interface INBATransformer {
  transformBoxscore(summary: any, event: any): BoxscoreResponse;
}

export interface INBADataSource {
  getScoreboard(date?: string): Promise<any>;
  getSummary(eventId: string): Promise<any>;
}

export interface IRedditDataSource {
  getIndex(): Promise<any>;
  searchRaw(query: string): Promise<any>;
  getCommentsRaw(postId: string, sort: string, permalink?: string): Promise<any>;
  getThreadContent(permalink: string): Promise<any>;
  getSubredditFeed(subreddit: string, sort?: 'new' | 'hot'): Promise<any>;
  fetchRaw(url: string): Promise<any>;
}
