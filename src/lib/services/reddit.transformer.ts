import type { RedditPost, RedditComment, RedditThreadMapping } from '$lib/types/nba';

export class RedditTransformer {
  transformSearch(json: any, type: 'live' | 'post'): { post?: RedditPost } {
    const items = json?.data?.children ?? [];
    const now = Date.now() / 1000;
    const fresh = items.filter((i: any) => (now - (i?.data?.created_utc ?? now)) <= (36 * 3600));
    
    const filtered = fresh.filter((i: any) => {
      const title = (i?.data?.title || '').toLowerCase();
      if (type === 'post') {
        return title.includes('post game thread') || title.includes('post-game thread') || title.includes('postgame thread');
      } else {
        return title.includes('game thread') && !title.includes('post game thread');
      }
    });

    const mapped = filtered.map((i: any) => ({
      id: i?.data?.id,
      title: i?.data?.title,
      permalink: i?.data?.permalink,
      url: `https://www.reddit.com${i?.data?.permalink}`,
      created_utc: i?.data?.created_utc,
      score: i?.data?.score
    }));

    return { post: mapped[0] || null };
  }

  transformComments(json: any): { comments: RedditComment[] } {
    if (!json || !Array.isArray(json)) {
      console.error('Reddit Transformer: Invalid JSON structure for comments:', JSON.stringify(json)?.slice(0, 200));
      return { comments: [] };
    }
    const commentsData = json[1];
    if (!commentsData) {
      console.warn('Reddit Transformer: No comments data found in json[1]');
    }
    return { comments: this.toTree(commentsData) };
  }

  transformIndex(json: any): { mapping: RedditThreadMapping } {
    const selfText = json?.[0]?.data?.children?.[0]?.data?.selftext ?? '';
    const lines: string[] = (selfText as string).split('\n');
    const mapping: RedditThreadMapping = {};
    
    for (const line of lines) {
      const m = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/.exec(line);
      if (!m) continue;
      const title = m[1];
      const url = m[2];
      const isPGT = title.toLowerCase().includes('post game thread');
      const parts = title.split(':')[1]?.trim() ?? title;
      const [awayPart, homePart] = parts.split(' at ').map(s => s?.trim());
      if (!awayPart || !homePart) continue;
      
      const key = [this.mascotName(awayPart), this.mascotName(homePart)].sort().join('|');
      const idMatch = /comments\/([a-z0-9]+)\//.exec(url);
      const id = idMatch?.[1] ?? '';
      
      mapping[key] = mapping[key] || {};
      const post: RedditPost = { id, title, url };
      
      if (isPGT) {
        mapping[key].pgt = post;
      } else {
        mapping[key].gdt = post;
      }
    }
    
    // Knicks fallback logic (preserving existing behavior)
    const knicksKey = ['Knicks', '76ers'].sort().join('|');
    if (!mapping[knicksKey]?.pgt) {
      mapping[knicksKey] = mapping[knicksKey] || {};
      mapping[knicksKey].pgt = {
        id: '1r2i5hi',
        title: 'Post Game Thread: Knicks vs 76ers',
        url: 'https://www.reddit.com/r/nba/comments/1r2i5hi/post_game_thread_the_new_york_knicks_3520_defeat/'
      };
    }
    
    return { mapping };
  }

  private mascotName(name: string): string {
    const n = (name || '').toLowerCase();
    const mascots = [
      'trail blazers', 'knicks', '76ers', 'lakers', 'celtics', 'warriors', 'nets',
      'raptors', 'bulls', 'cavaliers', 'pistons', 'pacers', 'bucks', 'heat',
      'magic', 'hawks', 'hornets', 'wizards', 'mavericks', 'rockets', 'grizzlies',
      'pelicans', 'spurs', 'nuggets', 'timberwolves', 'suns', 'kings', 'clippers',
      'thunder', 'jazz', 'blazers'
    ];
    
    for (const m of mascots) {
      if (n.includes(m)) {
        if (m === 'blazers' || m === 'trail blazers') return 'Trail Blazers';
        // Return capitalized version
        return m.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      }
    }
    return name;
  }

  private toTree(json: any, depth = 0): RedditComment[] {
    if (!json || !json.data || !json.data.children) {
      if (depth === 0) {
        console.warn('Reddit Transformer: toTree called with invalid structure:', JSON.stringify(json)?.slice(0, 200));
      }
      return [];
    }
    const arr = json.data.children;
    const nodes: RedditComment[] = [];
    for (const i of arr) {
      const d = i?.data;
      if (i?.kind !== 't1') continue;
      const node: RedditComment = {
        id: d?.id,
        author: d?.author,
        score: d?.score ?? 0,
        body: d?.body ?? '',
        created_utc: d?.created_utc ?? 0
      };
      if (depth < 2 && d?.replies && typeof d.replies === 'object') {
        node.replies = this.toTree(d.replies, depth + 1);
      }
      nodes.push(node);
    }
    return nodes;
  }
}
