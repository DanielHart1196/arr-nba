import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const REDDIT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36';

Deno.serve(async (req: Request) => {
  const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  let action: string | null = null;
  let payload: any = {};
  try {
    const body = await req.text();
    if (body) {
      payload = JSON.parse(body);
      action = payload.action;
    }
  } catch (_e) {}

  if (!action) action = new URL(req.url).searchParams.get('action');
  if (!action) return new Response("Missing action", { status: 400 });

  console.log(`--- Action: ${action} ---`);

  // NEW: Let the client report a thread they found
  if (action === 'report') {
    const { id, permalink, type, pair_key } = payload;
    if (!id || !permalink) return new Response("Missing thread info", { status: 400 });

    await supabase.from('active_polls').upsert({
      id, permalink, type, pair_key, status: 'LIVE', last_polled_at: new Date(0).toISOString()
    });
    return new Response("Thread reported and queued for polling");
  }

  // UPDATED: Poll known threads (less likely to be 403'd than Search)
  if (action === 'poll') {
    const { data: threads } = await supabase
        .from('active_polls')
        .select('*')
        .neq('status', 'STALE')
        .order('last_polled_at', { ascending: true })
        .limit(3);

    if (!threads || threads.length === 0) return new Response("No threads to poll");

    for (const thread of threads) {
      const sort = thread.type === 'PGT' ? 'top' : 'new';
      const res = await fetch(`https://www.reddit.com${thread.permalink}.json?sort=${sort}`, {
        headers: { 'User-Agent': REDDIT_USER_AGENT, 'Accept': 'application/json' }
      });

      if (!res.ok) {
        console.warn(`Poll failed for ${thread.id}: ${res.status}`);
        continue;
      }

      try {
        const json = await res.json();
        await supabase.from('reddit_cache').upsert({
          key: `reddit:comments:${thread.id}:${sort}`,
          data: json,
          expires_at: new Date(Date.now() + (thread.type === 'PGT' ? 3600000 : 60000)).toISOString(),
          updated_at: new Date().toISOString()
        });
        await supabase.from('active_polls').update({ last_polled_at: new Date().toISOString() }).eq('id', thread.id);
      } catch (_e) {
        console.error(`JSON Parse failed for ${thread.id}`);
      }
    }
    return new Response("Polling Complete");
  }

  return new Response("Action not implemented", { status: 400 });
})