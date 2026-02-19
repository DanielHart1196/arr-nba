import { e as expandTeamNames } from "../../../../../chunks/team-matching.utils.js";
const GET = async ({ url }) => {
  const awayTeam = url.searchParams.get("away") || "";
  const homeTeam = url.searchParams.get("home") || "";
  const type = url.searchParams.get("type") || "live";
  const expandedAway = expandTeamNames([awayTeam]);
  const expandedHome = expandTeamNames([homeTeam]);
  const allTeamNames = [...expandedAway, ...expandedHome];
  const base = type === "post" ? '"POST GAME THREAD"' : '"GAME THREAD"';
  const extra = type === "live" ? ' -"POST GAME THREAD"' : ' -"GAME THREAD"';
  const terms = allTeamNames.map((t) => `"${t}"`).join(" OR ");
  const query = `${base} (${terms})${extra}`;
  return new Response(JSON.stringify({
    awayTeam,
    homeTeam,
    type,
    expandedAway,
    expandedHome,
    query
  }), {
    headers: { "content-type": "application/json" }
  });
};
export {
  GET
};
