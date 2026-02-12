import { nbaService } from '$lib/services/nba.service';

export const GET = async ({ url }: any) => {
  const date = url.searchParams.get('date');
  try {
    const response = await nbaService.getScoreboard(date || undefined);
    return new Response(JSON.stringify(response), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? 'unknown' }), { status: 200 });
  }
};
