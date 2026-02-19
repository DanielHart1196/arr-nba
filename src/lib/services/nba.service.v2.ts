import type { ICache } from '../cache/cache.interface';
import type { 
  ScoreboardResponse, 
  BoxscoreResponse
} from '../types/nba';
import type { INBADataSource, INBATransformer } from './interfaces';

export class NBAService {
  private readonly browserScoreboardFreshMs = 6 * 60 * 60 * 1000; // 6 hours
  private readonly browserRefreshCooldownMs = 60 * 1000; // 1 minute
  private readonly refreshTracker = new Map<string, number>();

  constructor(
    private readonly dataSource: INBADataSource,
    private readonly transformer: INBATransformer,
    private readonly cache: ICache
  ) {}

  private isBrowser(): boolean {
    return typeof window !== 'undefined';
  }

  private scoreboardStorageKey(date?: string): string {
    return `arrnba:scoreboard:${date ?? 'today'}`;
  }

  private hashPayload(payload: ScoreboardResponse): string {
    const raw = JSON.stringify(payload?.events ?? []);
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = (hash * 31 + raw.charCodeAt(i)) | 0;
    }
    return `${raw.length}:${hash >>> 0}`;
  }

  private readBrowserScoreboard(date?: string): { ts: number; hash: string; data: ScoreboardResponse } | null {
    if (!this.isBrowser()) return null;
    try {
      const raw = localStorage.getItem(this.scoreboardStorageKey(date));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { ts: number; hash: string; data: ScoreboardResponse };
      if (!parsed || typeof parsed.ts !== 'number' || !parsed.data) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private writeBrowserScoreboard(date: string | undefined, data: ScoreboardResponse, hash?: string): void {
    if (!this.isBrowser()) return;
    try {
      const payload = {
        ts: Date.now(),
        hash: hash ?? this.hashPayload(data),
        data
      };
      localStorage.setItem(this.scoreboardStorageKey(date), JSON.stringify(payload));
    } catch {}
  }

  private async fetchScoreboard(date?: string): Promise<ScoreboardResponse> {
    const data = await this.dataSource.getScoreboard(date);
    return { events: data?.events ?? [] };
  }

  private maybeRefreshBrowserScoreboard(date: string | undefined, cacheKey: string, currentHash: string): void {
    if (!this.isBrowser()) return;

    const now = Date.now();
    const last = this.refreshTracker.get(cacheKey) ?? 0;
    if (now - last < this.browserRefreshCooldownMs) return;
    this.refreshTracker.set(cacheKey, now);

    (async () => {
      try {
        const fresh = await this.fetchScoreboard(date);
        const nextHash = this.hashPayload(fresh);
        if (nextHash !== currentHash) {
          this.writeBrowserScoreboard(date, fresh, nextHash);
          this.cache.set(cacheKey, fresh, 30 * 1000);
        } else {
          // Keep timestamp fresh so offline mode can trust this cached schedule for longer.
          this.writeBrowserScoreboard(date, fresh, currentHash);
        }
      } catch {
        // Ignore background refresh failures; stale local copy is still useful offline.
      }
    })();
  }

  async getScoreboard(date?: string): Promise<ScoreboardResponse> {
    const cacheKey = date ? `scoreboard:${date}` : 'scoreboard';

    if (!this.isBrowser()) {
      return this.cache.getOrFetch(
        cacheKey,
        async () => this.fetchScoreboard(date),
        30 * 1000 // 30 seconds TTL
      );
    }

    const memoryCached = this.cache.get<ScoreboardResponse>(cacheKey);
    if (memoryCached && !(memoryCached instanceof Promise)) return memoryCached;

    const browserCached = this.readBrowserScoreboard(date);
    if (browserCached?.data) {
      this.cache.set(cacheKey, browserCached.data, 30 * 1000);
      const isFresh = Date.now() - browserCached.ts < this.browserScoreboardFreshMs;
      if (!isFresh) {
        this.maybeRefreshBrowserScoreboard(date, cacheKey, browserCached.hash);
      } else {
        // Still refresh in the background to pick up schedule/score changes without blocking UI.
        this.maybeRefreshBrowserScoreboard(date, cacheKey, browserCached.hash);
      }
      return browserCached.data;
    }

    return this.cache.getOrFetch(
      cacheKey,
      async () => {
        const fresh = await this.fetchScoreboard(date);
        this.writeBrowserScoreboard(date, fresh);
        return fresh;
      },
      30 * 1000
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
        const eventFromScoreboard = scoreboard.events.find((e) => String(e.id) === String(eventId));
        const summaryCompetition = summary?.header?.competitions?.[0];
        const eventFromSummary = summaryCompetition
          ? { id: String(eventId), competitions: [summaryCompetition] }
          : undefined;
        const event = eventFromScoreboard ?? eventFromSummary;
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

  async prewarmScoreboards(dates: string[]): Promise<void> {
    const unique = Array.from(new Set(dates.filter(Boolean)));
    const promises = unique.map((date) =>
      this.getScoreboard(date).catch((error) => {
        console.warn(`Failed to prewarm scoreboard ${date}:`, error);
      })
    );
    await Promise.allSettled(promises);
  }

  cleanupCache(): void {
    if (this.cache.cleanup) {
      this.cache.cleanup();
    }
  }
}
