import { e as expandTeamNames } from "../../../../../../chunks/team-matching.utils.js";
const POST = async ({ request }) => {
  try {
    const body = await request.json();
    const { awayTeam, homeTeam } = body;
    if (!awayTeam || !homeTeam) {
      return new Response(JSON.stringify({ error: "Missing team names" }), { status: 400 });
    }
    const expandedAway = expandTeamNames([awayTeam]);
    const expandedHome = expandTeamNames([homeTeam]);
    const allTeamNames = [...expandedAway, ...expandedHome];
    const terms = allTeamNames.map((t) => `"${t}"`).join(" OR ");
    const query = `"POST GAME THREAD" (${terms}) -"GAME THREAD"`;
    console.log(`Fallback search query: ${query}`);
    const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 (arr-nba app)";
    const res = await fetch(`https://www.reddit.com/r/nba/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=new&t=week`, {
      headers: { "User-Agent": USER_AGENT }
    });
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `Search failed: ${res.status}` }), { status: 500 });
    }
    const json = await res.json();
    const items = json?.data?.children ?? [];
    const now = Date.now() / 1e3;
    const fresh = items.filter((i) => {
      const created = i?.data?.created_utc ?? 0;
      const title = (i?.data?.title || "").toLowerCase();
      const isRecent = now - created <= 48 * 3600;
      return isRecent && (title.includes("post game thread") || title.includes("post-game thread") || title.includes("postgame thread"));
    });
    if (fresh.length === 0) {
      return new Response(JSON.stringify({ error: "No post-game thread found" }), { status: 404 });
    }
    fresh.sort((a, b) => (b?.data?.score ?? 0) - (a?.data?.score ?? 0));
    const bestMatch = fresh[0];
    const result = {
      id: bestMatch?.data?.id,
      title: bestMatch?.data?.title,
      permalink: bestMatch?.data?.permalink,
      url: `https://www.reddit.com${bestMatch?.data?.permalink}`,
      created_utc: bestMatch?.data?.created_utc,
      score: bestMatch?.data?.score
    };
    console.log(`Fallback found PGT: ${result.title}`);
    return new Response(JSON.stringify({ post: result }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (error) {
    console.error("Fallback search error:", error);
    return new Response(JSON.stringify({ error: "Fallback search failed" }), { status: 500 });
  }
};
export {
  POST
};
