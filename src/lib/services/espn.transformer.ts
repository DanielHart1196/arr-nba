import type { INBATransformer } from './interfaces';
import type { BoxscoreResponse } from '$lib/types/nba';
import { normalizePlayers, parseLinescores } from '$lib/utils/espn';

export class ESPNBasketTransformer implements INBATransformer {
  transformBoxscore(summary: any, event: any): BoxscoreResponse {
    const { players, names } = normalizePlayers(summary, event);
    const linescores = parseLinescores(summary, event);
    const highlights = this.extractHighlights(summary);
    const plays = this.extractPlays(summary, event);
    
    const status = (() => {
      const comp = event?.competitions?.[0];
      const type = comp?.status?.type;
      const clock = comp?.status?.displayClock || '';
      const period = comp?.status?.period || 0;
      const short = type?.shortDetail || '';
      const name = type?.name || '';
      return { clock, period, short, name };
    })();

    return {
      id: summary?.id || event?.id || '',
      eventDate: event?.date || summary?.header?.competitions?.[0]?.date || '',
      boxscore: summary?.boxscore ?? {},
      highlights,
      plays,
      players,
      linescores,
      names,
      status
    };
  }

  private extractHighlights(summary: any): BoxscoreResponse['highlights'] {
    const videos = Array.isArray(summary?.videos) ? summary.videos : [];
    const seen = new Set<string>();
    const out: NonNullable<BoxscoreResponse['highlights']> = [];

    for (const video of videos) {
      const link = video?.links;
      const sourceUrl =
        link?.source?.HD?.href ||
        link?.source?.full?.href ||
        link?.source?.href ||
        link?.mobile?.source?.href ||
        link?.source?.HLS?.href;
      if (!sourceUrl || seen.has(sourceUrl)) continue;
      seen.add(sourceUrl);
      const headline = String(video?.headline ?? '').trim();
      out.push({
        label: headline || `Highlight ${out.length + 1}`,
        url: sourceUrl,
        mode: 'video'
      });
      if (out.length >= 8) break;
    }

    return out;
  }

  private extractPlays(summary: any, event: any): BoxscoreResponse['plays'] {
    const plays = Array.isArray(summary?.plays) ? summary.plays : [];
    if (plays.length === 0) return [];

    const competitors =
      summary?.header?.competitions?.[0]?.competitors ??
      event?.competitions?.[0]?.competitors ??
      [];
    const teamIdToAbbr = new Map<string, string>();
    for (const c of competitors) {
      const teamId = c?.team?.id;
      const abbr = c?.team?.abbreviation || c?.team?.shortDisplayName || c?.team?.displayName;
      if (teamId && abbr) teamIdToAbbr.set(String(teamId), String(abbr));
    }

    return plays
      .map((play: any) => {
        const text = String(play?.text ?? play?.shortDescription ?? '').trim();
        const short = String(play?.shortDescription ?? '').trim();
        const periodRaw = play?.period?.number ?? play?.period?.displayValue ?? play?.period ?? '';
        const period = Number.isFinite(Number(periodRaw)) ? Number(periodRaw) : periodRaw;
        const clock = String(play?.clock?.displayValue ?? play?.clock ?? '').trim();
        const id = String(play?.id ?? play?.sequenceNumber ?? '');
        const teamId = play?.team?.id ? String(play.team.id) : '';
        const teamAbbr =
          teamIdToAbbr.get(teamId) ||
          play?.team?.abbreviation ||
          play?.team?.shortDisplayName ||
          play?.team?.displayName;

        return {
          id,
          text,
          short: short || undefined,
          awayScore: play?.awayScore ?? undefined,
          homeScore: play?.homeScore ?? undefined,
          period: period || undefined,
          clock: clock || undefined,
          scoringPlay: Boolean(play?.scoringPlay),
          teamAbbr: teamAbbr ? String(teamAbbr) : undefined
        };
      })
      .filter((play: any) => play.text);
  }
}
