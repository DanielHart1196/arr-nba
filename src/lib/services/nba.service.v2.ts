import type { ICache } from '../cache/cache.interface';
import type { 
  ScoreboardResponse, 
  BoxscoreResponse
} from '../types/nba';
import type { INBADataSource, INBATransformer } from './interfaces';

export class NBAService {
  constructor(
    private readonly dataSource: INBADataSource,
    private readonly transformer: INBATransformer,
    private readonly cache: ICache
  ) {}

  async getScoreboard(date?: string): Promise<ScoreboardResponse> {
    const cacheKey = date ? `scoreboard:${date}` : 'scoreboard';
    return this.cache.getOrFetch(
      cacheKey,
      async () => {
        const data = await this.dataSource.getScoreboard(date);
        return { events: data?.events ?? [] };
      },
      30 * 1000 // 30 seconds TTL
    );
  }

  async getBoxscore(eventId: string): Promise<BoxscoreResponse> {
    const cacheKey = `boxscore:${eventId}`;
    return this.cache.getOrFetch(
      cacheKey,
      async () => {
        const [summary, scoreboard] = await Promise.all([
          this.dataSource.getSummary(eventId),
          this.getScoreboard()
        ]);
        const event = scoreboard.events.find(e => String(e.id) === String(eventId));
        return this.transformer.transformBoxscore(summary, event);
      },
      15 * 1000 // 15 seconds TTL
    );
  }

  async prewarmBoxscores(eventIds: string[]): Promise<void> {
    const promises = eventIds.map(id => 
      this.getBoxscore(id).catch(error => {
        console.warn(`Failed to prewarm boxscore ${id}:`, error);
      })
    );
    await Promise.allSettled(promises);
  }

  cleanupCache(): void {
    this.cache.cleanup();
  }
}
