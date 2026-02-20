import type { INBADataSource } from './interfaces';

export class ESPNDataSource implements INBADataSource {
  private isBrowser(): boolean {
    return typeof window !== 'undefined';
  }

  async getScoreboard(date?: string, forceRefresh: boolean = false): Promise<any> {
    if (this.isBrowser()) {
      const search = new URLSearchParams();
      if (date) search.set('date', date);
      if (forceRefresh) {
        search.set('forceRefresh', '1');
        search.set('_ts', String(Date.now()));
      }
      const fetchOpts = forceRefresh ? { cache: 'no-store' as RequestCache } : undefined;
      const res = await fetch(`/api/scoreboard?${search.toString()}`, fetchOpts);
      if (!res.ok) throw new Error(`Scoreboard API error: ${res.status}`);
      return res.json();
    }

    const url = date 
      ? `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${date}`
      : 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
    const res = await fetch(url, forceRefresh ? { cache: 'no-store' } : undefined);
    if (!res.ok) throw new Error(`ESPN Scoreboard error: ${res.status}`);
    return res.json();
  }

  async getSummary(eventId: string): Promise<any> {
    const res = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${eventId}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`ESPN Summary error: ${res.status}`);
    return res.json();
  }
}
