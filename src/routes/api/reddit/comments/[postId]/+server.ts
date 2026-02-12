type CommentNode = {
  id: string;
  author: string;
  score: number;
  body: string;
  created_utc: number;
  replies?: CommentNode[];
};

const cache = new Map<string, { ts: number; value: any }>();
const TTL_MS = 20_000;

function toTree(json: any, depth = 0): CommentNode[] {
  if (!json) return [];
  const arr = json?.data?.children ?? [];
  const nodes: CommentNode[] = [];
  for (const i of arr) {
    const d = i?.data;
    if (i?.kind !== 't1') continue;
    const node: CommentNode = {
      id: d?.id,
      author: d?.author,
      score: d?.score ?? 0,
      body: d?.body ?? '',
      created_utc: d?.created_utc ?? 0
    };
    if (depth < 2 && d?.replies) {
      node.replies = toTree(d.replies, depth + 1);
    }
    nodes.push(node);
  }
  return nodes;
}

export const GET = async ({ params, url }: any) => {
  const id = params.postId;
  const sort = url.searchParams.get('sort') || 'new';
  const permalink = url.searchParams.get('permalink') || '';
  const key = `${id || permalink}|${sort}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.ts < TTL_MS) {
    return new Response(JSON.stringify(hit.value), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  try {
    const target = permalink ? `https://www.reddit.com${permalink}.json?sort=${sort}` : `https://www.reddit.com/comments/${id}.json?sort=${sort}`;
    const res = await fetch(target);
    if (!res.ok) {
      const fallback = { comments: [] };
      cache.set(key, { ts: now, value: fallback });
      return new Response(JSON.stringify(fallback), { status: 200 });
    }
    const json = await res.json();
    const comments = toTree(json?.[1]);
    const value = { comments };
    cache.set(key, { ts: now, value });
    return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
  } catch {
    const value = { comments: [] };
    cache.set(key, { ts: now, value });
    return new Response(JSON.stringify(value), { status: 200 });
  }
};
