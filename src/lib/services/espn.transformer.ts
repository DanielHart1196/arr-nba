import type { INBATransformer } from './interfaces';
import type { BoxscoreResponse } from '$lib/types/nba';
import { normalizePlayers, parseLinescores } from '$lib/utils/espn';

export class ESPNBasketTransformer implements INBATransformer {
  transformBoxscore(summary: any, event: any): BoxscoreResponse {
    const { players, names } = normalizePlayers(summary, event);
    const linescores = parseLinescores(summary, event);
    
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
      players,
      linescores,
      names,
      status
    };
  }
}
