import { normalizePlayers, parseLinescores } from '../../../../lib/utils/espn';

const cache = new Map<string, { ts: number; value: any }>();
const TTL_MS = 30_000;

export const GET = async ({ params }: any) => {
  const id = params.eventId;
  const now = Date.now();
  const hit = cache.get(id || '');
  if (hit && now - hit.ts < TTL_MS) {
    return new Response(JSON.stringify(hit.value), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  try {
    const summaryRes = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${id}`);
    if (!summaryRes.ok) {
      const fallback = { error: `status ${summaryRes.status}` };
      cache.set(id || '', { ts: now, value: fallback });
      return new Response(JSON.stringify(fallback), { status: 200 });
    }
    const summary = await summaryRes.json();
    const scoreboardRes = await fetch(`https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard`);
    const scoreboardJson = scoreboardRes.ok ? await scoreboardRes.json() : null;
    const event = scoreboardJson?.events?.find((e: any) => String(e?.id) === String(id));

    const { players, names } = normalizePlayers(summary, event);
    const linescores = parseLinescores(summary, event);
    const status = (() => {
      const comp = event?.competitions?.[0];
      const type = comp?.status?.type;
      const clock = comp?.status?.displayClock || '';
      const period = comp?.status?.period || 0;
      const short = type?.shortDetail || '';
      const name = type?.name || '';
      return { clock, period, short, name };
    })();

    const payload = { boxscore: summary?.boxscore ?? {}, players, linescores, names, status };
    cache.set(id || '', { ts: now, value: payload });
    return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch (e: any) {
    const payload = { error: e?.message ?? 'unknown' };
    cache.set(id || '', { ts: now, value: payload });
    return new Response(JSON.stringify(payload), { status: 200 });
  }
};
