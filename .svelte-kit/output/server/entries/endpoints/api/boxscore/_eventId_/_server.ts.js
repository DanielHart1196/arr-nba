import { n as nbaService } from "../../../../../chunks/nba.service.js";
const GET = async ({ params }) => {
  const id = params.eventId;
  try {
    const payload = await nbaService.getBoxscore(id);
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message ?? "unknown" }), { status: 200 });
  }
};
export {
  GET
};
