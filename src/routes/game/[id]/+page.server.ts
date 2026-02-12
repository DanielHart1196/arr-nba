import { nbaService } from '$lib/services/nba.service';

export const load = async ({ params }: any) => {
  return { 
    id: params.id,
    streamed: {
      payload: nbaService.getBoxscore(params.id)
    }
  };
};
