export const GET = async () => {
  try {
    const search = await fetch('https://www.reddit.com/r/nba/search.json?q=Daily%20Game%20Thread%20Index&restrict_sr=1&sort=new&t=week');
    if (!search.ok) return new Response(JSON.stringify({ error: 'Failed to search' }), { status: 500 });
    
    const list = await search.json();
    const items = list?.data?.children ?? [];
    const post = items.find((i: any) => i?.data?.title?.toLowerCase()?.includes('daily game thread index'));
    
    if (!post) {
      return new Response(JSON.stringify({ error: 'No daily index found' }), { status: 404 });
    }
    
    const permalink = post?.data?.permalink;
    const mdRes = await fetch(`https://www.reddit.com${permalink}.json`);
    if (!mdRes.ok) return new Response(JSON.stringify({ error: 'Failed to fetch index content' }), { status: 500 });
    
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
      headers: { 'content-type': 'application/json' }
    });
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Debug endpoint failed', 
      details: error instanceof Error ? error.message : 'Unknown error'
    }), { status: 500 });
  }
};
