import type { INBADataSource } from './interfaces';
import { isNativeRuntime, resolveApiUrl } from '$lib/utils/runtime';

export class ESPNDataSource implements INBADataSource {
  private isBrowser(): boolean {
    return typeof window !== 'undefined';
  }

  private async fetchJsonDirect(url: string, forceRefresh: boolean = false): Promise<any> {
    if (isNativeRuntime()) {
      const { CapacitorHttp } = await import('@capacitor/core');
      const response = await CapacitorHttp.request({
        method: 'GET',
        url,
        headers: { Accept: 'application/json' },
        connectTimeout: 15000,
        readTimeout: 15000
      });
      if (response.status < 200 || response.status >= 300) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      return typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    }

    const res = await fetch(url, forceRefresh ? { cache: 'no-store' } : undefined);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }

  async getScoreboard(date?: string, forceRefresh: boolean = false): Promise<any> {
    if (this.isBrowser()) {
      if (isNativeRuntime()) {
        const directUrl = date
          ? `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${date}`
          : 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
        return this.fetchJsonDirect(directUrl, forceRefresh);
      }

      const search = new URLSearchParams();
      if (date) search.set('date', date);
      if (forceRefresh) {
        search.set('forceRefresh', '1');
        search.set('_ts', String(Date.now()));
      }
      const fetchOpts = forceRefresh ? { cache: 'no-store' as RequestCache } : undefined;
      const res = await fetch(resolveApiUrl(`/api/scoreboard?${search.toString()}`), fetchOpts);
      if (!res.ok) throw new Error(`Scoreboard API error: ${res.status}`);
      const payload = await res.json();
      if (payload?.error) {
        const directUrl = date
          ? `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${date}`
          : 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
        return this.fetchJsonDirect(directUrl, forceRefresh);
      }
      return payload;
    }

    const url = date 
      ? `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${date}`
      : 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard';
    const res = await fetch(url, forceRefresh ? { cache: 'no-store' } : undefined);
    if (!res.ok) throw new Error(`ESPN Scoreboard error: ${res.status}`);
    return res.json();
  }

  async getStandings(forceRefresh: boolean = false): Promise<any> {
    if (this.isBrowser()) {
      if (isNativeRuntime()) {
        return this.fetchJsonDirect(
          'https://site.web.api.espn.com/apis/v2/sports/basketball/nba/standings',
          forceRefresh
        );
      }

      const search = new URLSearchParams();
      if (forceRefresh) {
        search.set('forceRefresh', '1');
        search.set('_ts', String(Date.now()));
      }
      const qs = search.toString();
      const fetchOpts = forceRefresh ? { cache: 'no-store' as RequestCache } : undefined;
      const res = await fetch(resolveApiUrl(`/api/standings${qs ? `?${qs}` : ''}`), fetchOpts);
      if (!res.ok) throw new Error(`Standings API error: ${res.status}`);
      const payload = await res.json();
      if (payload?.error) {
        return this.fetchJsonDirect(
          'https://site.web.api.espn.com/apis/v2/sports/basketball/nba/standings',
          forceRefresh
        );
      }
      return payload;
    }

    const res = await fetch(
      'https://site.web.api.espn.com/apis/v2/sports/basketball/nba/standings',
      forceRefresh ? { cache: 'no-store' } : undefined
    );
    if (!res.ok) throw new Error(`ESPN Standings error: ${res.status}`);
    return res.json();
  }

  async getSummary(eventId: string, forceRefresh: boolean = false): Promise<any> {
    if (this.isBrowser()) {
      if (isNativeRuntime()) {
        return this.fetchJsonDirect(
          `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${eventId}`,
          forceRefresh
        );
      }

      const search = new URLSearchParams();
      if (forceRefresh) {
        search.set('forceRefresh', '1');
        search.set('_ts', String(Date.now()));
      }
      const qs = search.toString();
      const fetchOpts = forceRefresh ? { cache: 'no-store' as RequestCache } : undefined;
      const res = await fetch(resolveApiUrl(`/api/summary/${encodeURIComponent(eventId)}${qs ? `?${qs}` : ''}`), fetchOpts);
      if (!res.ok) throw new Error(`Summary API error: ${res.status}`);
      const payload = await res.json();
      if (payload?.error) {
        return this.fetchJsonDirect(
          `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${eventId}`,
          forceRefresh
        );
      }
      return payload;
    }

    const res = await fetch(
      `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${eventId}`,
      forceRefresh ? { cache: 'no-store' } : undefined
    );
    if (!res.ok) throw new Error(`ESPN Summary error: ${res.status}`);
    return res.json();
  }
}
