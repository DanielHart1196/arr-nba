import type { INBATransformer } from './interfaces';
import type { BoxscoreResponse } from '$lib/types/nba';
import { normalizePlayers, parseLinescores } from '$lib/utils/espn';

export class ESPNBasketTransformer implements INBATransformer {
  transformBoxscore(summary: any, event: any): BoxscoreResponse {
    const { players, names } = normalizePlayers(summary, event);
    const linescores = parseLinescores(summary, event);
    const highlights = this.extractHighlights(summary);
    
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
}
