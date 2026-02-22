import { nbaService } from '$lib/services/nba.service';

export const GET = async ({ params, url }: any) => {
  const id = params.eventId;
  const forceRefresh = url.searchParams.get('forceRefresh') === '1';
  try {
    const payload = await nbaService.getBoxscore(id, forceRefresh);
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'unknown' }), {
      status: 500,
      headers: { 'content-type': 'application/json' }
    });
  }
};
