import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

// IMPORTANT: REPLACE THIS with your actual Vercel URL (e.g. https://arr-nba.vercel.app)
const VERCEL_APP_URL = 'https://arr-nba.vercel.app';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  let action: string | null = null;
  let payload: any = {};
  try {
    const text = await req.text();
    if (text) {
      payload = JSON.parse(text);
      action = payload.action;
    }
  } catch (_e) {}

  if (!action) action = new URL(req.url).searchParams.get('action');
  console.log(`[SYNC] Action: ${action}`);

  if (action === 'report') {
    const { id, permalink, type, pair_key } = payload;
    await supabase.from('active_polls').upsert({
      id, permalink, type, pair_key, status: 'LIVE', last_polled_at: new Date(0).toISOString()
    });
    return new Response(JSON.stringify({ status: 'ok' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (action === 'discover') {
    console.log("[DISCOVER] Starting automated discovery...");
    
    // 1. Fetch Reddit Index via Vercel Bridge
    const indexSearchUrl = `https://www.reddit.com/r/nba/search.json?q=Daily%20Game%20Thread%20Index&restrict_sr=1&sort=new&limit=1`;
    const bridgeUrl = `${VERCEL_APP_URL}/api/reddit/proxy?url=${encodeURIComponent(indexSearchUrl)}`;
    
    try {
      const res = await fetch(bridgeUrl);
      if (!res.ok) throw new Error(`Bridge Error: ${res.status}`);
      
      const searchJson = await res.json();
      const indexPost = searchJson.data?.children?.[0]?.data;
      
      if (indexPost) {
        console.log(`[DISCOVER] Found Index: ${indexPost.title}`);
        const threadUrl = `https://www.reddit.com${indexPost.permalink}.json`;
        const threadRes = await fetch(`${VERCEL_APP_URL}/api/reddit/proxy?url=${encodeURIComponent(threadUrl)}`);
        
        if (threadRes.ok) {
          const threadJson = await threadRes.json();
          const selftext = threadJson[0]?.data?.children?.[0]?.data?.selftext || "";
          const lines = selftext.split('\n');
          
          for (const line of lines) {
            const m = /\[([^\]]+)\]\((https?:\/\/www\.reddit\.com\/r\/nba\/comments\/([a-z0-9]+)[^\)]*)\)/.exec(line);
            if (m) {
              const title = m[1];
              const permalink = new URL(m[2]).pathname;
              const id = m[3];
              const type = title.toLowerCase().includes('post game') ? 'PGT' : 'GDT';
              
              // Extract team pair key
              const parts = title.split(':')[1]?.trim() ?? title;
              const teams = parts.split(' at ').map((s: string) => s.trim());
              if (teams.length === 2) {
                const pair_key = teams.sort().join('|');
                await supabase.from('active_polls').upsert({
                  id, permalink, type, pair_key, status: 'LIVE'
                });
              }
            }
          }
          console.log("[DISCOVER] Index processed.");
        }
      }
    } catch (e) {
      console.error(`[DISCOVER] Failed: ${e.message}`);
    }
    return new Response("Discovery Complete", { headers: corsHeaders });
  }

  if (action === 'poll') {
    for (let i = 0; i < 5; i++) {
      const { data: threads } = await supabase
          .from('active_polls')
          .select('*')
          .neq('status', 'STALE')
          .order('last_polled_at', { ascending: true })
          .limit(3);

      if (threads && threads.length > 0) {
        for (const thread of threads) {
          const sort = thread.type === 'PGT' ? 'top' : 'new';
          const redditUrl = `https://www.reddit.com${thread.permalink}.json?sort=${sort}&limit=50`;

          // WE CALL THE VERCEL BRIDGE HERE
          const bridgeUrl = `${VERCEL_APP_URL}/api/reddit/proxy?url=${encodeURIComponent(redditUrl)}`;

          try {
            console.log(`[POLL] Fetching via Bridge for ${thread.pair_key}...`);
            const res = await fetch(bridgeUrl);

            if (res.ok) {
              const json = await res.json();
              await supabase.from('reddit_cache').upsert({
                key: `reddit:comments:${thread.id}:${sort}`,
                data: json,
                expires_at: new Date(Date.now() + 600000).toISOString(),
                updated_at: new Date().toISOString()
              });
              console.log(`[POLL] Success via Bridge!`);
            } else {
              console.error(`[POLL] Bridge Error: ${res.status}`);
            }
          } catch (e) {
            console.error(`[POLL] Bridge Connection Failed`);
          }

          await supabase.from('active_polls').update({
            last_polled_at: new Date().toISOString()
          }).eq('id', thread.id);
        }
      }
      if (i < 4) await new Promise(r => setTimeout(r, 10000));
    }
    return new Response("Polling Complete", { headers: corsHeaders });
  }

  return new Response("No Action", { headers: corsHeaders, status: 400 });
})