import type { INBADataSource } from './interfaces';

export class ESPNDataSource implements INBADataSource {
  async getScoreboard(date?: string): Promise<any> {
    const url = date 
      ? `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${date}`
      : 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
    const res = await fetch(url);
    if (!res.ok) throw new Error(`ESPN Scoreboard error: ${res.status}`);
    return res.json();
  }

  async getSummary(eventId: string): Promise<any> {
    const res = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${eventId}`);
    if (!res.ok) throw new Error(`ESPN Summary error: ${res.status}`);
    return res.json();
  }
}
