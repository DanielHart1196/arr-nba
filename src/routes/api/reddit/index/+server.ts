function mascotName(name: string) {
  const n = (name || '').toLowerCase();
  if (n.includes('trail blazers')) return 'Trail Blazers';
  return name;
}

export const GET = async () => {
  try {
    const search = await fetch('https://www.reddit.com/r/nba/search.json?q=Daily%20Game%20Thread%20Index&restrict_sr=1&sort=new&t=week');
    if (!search.ok) return new Response(JSON.stringify({ mapping: {} }), { status: 200 });
    const list = await search.json();
    const items = list?.data?.children ?? [];
    const post = items.find((i: any) => i?.data?.title?.toLowerCase()?.includes('daily game thread index'));
    if (!post) return new Response(JSON.stringify({ mapping: {} }), { status: 200 });
    const permalink = post?.data?.permalink;
    const mdRes = await fetch(`https://www.reddit.com${permalink}.json`);
    if (!mdRes.ok) return new Response(JSON.stringify({ mapping: {} }), { status: 200 });
    const md = await mdRes.json();
    const selfText = md?.[0]?.data?.children?.[0]?.data?.selftext ?? '';
    const lines: string[] = (selfText as string).split('\n');
    const mapping: Record<string, { gdt?: { id: string; url: string }, pgt?: { id: string; url: string } }> = {};
    for (const line of lines) {
      // format example: [Game Thread: Away at Home](https://reddit.com/xyz)
      const m = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/.exec(line);
      if (!m) continue;
      const title = m[1];
      const url = m[2];
      const isPGT = title.toLowerCase().includes('post game thread');
      const parts = title.split(':')[1]?.trim() ?? title;
      const [awayPart, homePart] = parts.split(' at ').map(s => s?.trim());
      if (!awayPart || !homePart) continue;
      const key = [mascotName(awayPart), mascotName(homePart)].sort().join('|');
      const idMatch = /comments\/([a-z0-9]+)\//.exec(url);
      const id = idMatch?.[1] ?? '';
      mapping[key] = mapping[key] || {};
      if (isPGT) mapping[key].pgt = { id, url };
      else mapping[key].gdt = { id, url };
    }
    return new Response(JSON.stringify({ mapping }), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch {
    return new Response(JSON.stringify({ mapping: {} }), { status: 200 });
  }
};
