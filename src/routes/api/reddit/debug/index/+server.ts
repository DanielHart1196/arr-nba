export const GET = async () => {
  const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 (arr-nba app)';
  const NO_STORE_HEADERS = {
    'content-type': 'application/json',
    'cache-control': 'no-store'
  };
  try {
    const search = await fetch('https://www.reddit.com/r/nba/search.json?q=Daily%20Game%20Thread%20Index&restrict_sr=1&sort=new&t=week', {
      headers: { 'User-Agent': USER_AGENT }
    });
    if (!search.ok) return new Response(JSON.stringify({ error: `Failed to search: ${search.status}` }), { status: 500, headers: NO_STORE_HEADERS });
    
    const list = await search.json();
    const items = list?.data?.children ?? [];
    const post = items.find((i: any) => i?.data?.title?.toLowerCase()?.includes('daily game thread index'));
    
    if (!post) {
      return new Response(JSON.stringify({ error: 'No daily index found' }), { status: 404, headers: NO_STORE_HEADERS });
    }
    
    const permalink = post?.data?.permalink;
    const mdRes = await fetch(`https://www.reddit.com${permalink}.json`, {
      headers: { 'User-Agent': USER_AGENT }
    });
    if (!mdRes.ok) return new Response(JSON.stringify({ error: `Failed to fetch index content: ${mdRes.status}` }), { status: 500, headers: NO_STORE_HEADERS });
    
    const md = await mdRes.json();
    const selfText = md?.[0]?.data?.children?.[0]?.data?.selftext ?? '';
    const lines: string[] = selfText.split('\n');
    
    // Find Knicks vs 76ers entries
    const knicksPhillyLines = lines.filter(line => 
      line.toLowerCase().includes('knicks') && line.toLowerCase().includes('76ers') ||
      line.toLowerCase().includes('new york') && line.toLowerCase().includes('philadelphia')
    );
    
    return new Response(JSON.stringify({
      indexTitle: post?.data?.title,
      indexPermalink: post?.data?.permalink,
      knicksPhillyEntries: knicksPhillyLines,
      totalLines: lines.length
    }), {
      headers: NO_STORE_HEADERS
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Debug endpoint failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }), { status: 500, headers: NO_STORE_HEADERS });
  }
};
