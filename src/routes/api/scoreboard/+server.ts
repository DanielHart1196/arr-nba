export const GET = async () => {
  try {
    const res = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard');
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `status ${res.status}` }), { status: 200 });
    }
    const json = await res.json();
    const events = json?.events ?? [];
    return new Response(JSON.stringify({ events }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'unknown' }), { status: 200 });
  }
};
