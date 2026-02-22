export const GET = async ({ params, url }: any) => {
  const id = params.eventId;
  const forceRefresh = url.searchParams.get('forceRefresh') === '1';
  try {
    const res = await fetch(
      `https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${encodeURIComponent(id)}`,
      forceRefresh ? { cache: 'no-store' } : undefined
    );
    if (!res.ok) {
      return new Response(JSON.stringify({ error: `ESPN Summary error: ${res.status}` }), {
        status: res.status,
        headers: { 'content-type': 'application/json' }
      });
    }
    const payload = await res.json();
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'unknown' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
};
