function buildQuery(type: 'live'|'post', away: string[], home: string[]) {
  const base = type === 'post' ? '"POST GAME THREAD"' : '"GAME THREAD"';
  const extra = type === 'live' ? ' -\"POST GAME THREAD\"' : '';
  const terms = [...away, ...home].map(t => `"${t}"`).join(' ');
  return `${base} ${terms}${extra}`;
}

export const POST = async ({ request }: any) => {
  try {
    const body = await request.json();
    const type = body?.type === 'post' ? 'post' : 'live';
    const awayCandidates: string[] = body?.awayCandidates ?? [];
    const homeCandidates: string[] = body?.homeCandidates ?? [];
    const q = buildQuery(type, awayCandidates, homeCandidates);
    const res = await fetch(`https://www.reddit.com/r/nba/search.json?q=${encodeURIComponent(q)}&restrict_sr=1&sort=new&t=week`);
    if (!res.ok) return new Response(JSON.stringify({ posts: [] }), { status: 200 });
    const json = await res.json();
    const items = json?.data?.children ?? [];
    const now = Date.now() / 1000;
    const fresh = items.filter((i: any) => (now - (i?.data?.created_utc ?? now)) <= (36 * 3600));
    const mapped = fresh.map((i: any) => ({
      id: i?.data?.id,
      permalink: i?.data?.permalink,
      url: `https://www.reddit.com${i?.data?.permalink}`
    }));
    return new Response(JSON.stringify(mapped[0] ? { post: mapped[0] } : { posts: mapped }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ posts: [] }), { status: 200 });
  }
};
