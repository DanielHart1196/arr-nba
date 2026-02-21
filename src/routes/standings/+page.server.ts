import { nbaService } from '$lib/services/nba.service';

export const load = async () => {
  try {
    const standings = await nbaService.getStandings(true);
    return { standings, error: null };
  } catch (error: any) {
    return {
      standings: null,
      error: error?.message ?? 'Failed to load standings'
    };
  }
};
