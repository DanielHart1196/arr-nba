import { n as nbaService } from "../../../../chunks/nba.service.js";
const load = async ({ params }) => {
  return {
    id: params.id,
    streamed: {
      payload: nbaService.getBoxscore(params.id)
    }
  };
};
export {
  load
};
