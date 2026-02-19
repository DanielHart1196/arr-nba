import { n as nbaService } from "../../../../chunks/nba.service.js";
const GET = async ({ url }) => {
  const date = url.searchParams.get("date");
  try {
    const response = await nbaService.getScoreboard(date || void 0);
    return new Response(JSON.stringify(response), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message ?? "unknown" }), { status: 200 });
  }
};
export {
  GET
};
