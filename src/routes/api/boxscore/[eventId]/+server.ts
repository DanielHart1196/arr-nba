import { nbaService } from '$lib/services/nba.service';

export const GET = async ({ params }: any) => {
  const id = params.eventId;
  try {
    const payload = await nbaService.getBoxscore(id);
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'unknown' }), { status: 200 });
  }
};
