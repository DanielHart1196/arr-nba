import type { IRedditDataSource } from './interfaces';
import type { RedditPost, RedditComment, RedditSearchRequest } from '$lib/types/nba';

export class RedditDataSource implements IRedditDataSource {
  private readonly BASE_URL = '/api/reddit';

  async getIndex(): Promise<any> {
    if (typeof window !== 'undefined') {
      const res = await fetch(`${this.BASE_URL}/index`);
      if (!res.ok) throw new Error(`Reddit Index error: ${res.status}`);
      return res.json();
    } else {
      const res = await fetch('https://www.reddit.com/r/nba/search.json?q=Daily%20Game%20Thread%20Index&restrict_sr=1&sort=new');
      if (!res.ok) throw new Error(`Reddit Index error: ${res.status}`);
      return res.json();
    }
  }

  async searchRaw(query: string): Promise<any> {
    if (typeof window !== 'undefined') {
      const res = await fetch(`${this.BASE_URL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      if (!res.ok) throw new Error(`Reddit Search error: ${res.status}`);
      return res.json();
    } else {
      const res = await fetch(`https://www.reddit.com/r/nba/search.json?q=${encodeURIComponent(query)}&restrict_sr=1&sort=new&t=week`);
      if (!res.ok) throw new Error(`Reddit Search error: ${res.status}`);
      return res.json();
    }
  }

  async getCommentsRaw(postId: string, sort: string, permalink?: string): Promise<any> {
    if (typeof window !== 'undefined') {
      const url = new URL(`${window.location.origin}${this.BASE_URL}/comments/${postId}`);
      url.searchParams.set('sort', sort);
      if (permalink) url.searchParams.set('permalink', permalink);
      
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Reddit Comments error: ${res.status}`);
      return res.json();
    } else {
      const target = permalink ? `https://www.reddit.com${permalink}.json?sort=${sort}` : `https://www.reddit.com/comments/${postId}.json?sort=${sort}`;
      const res = await fetch(target);
      if (!res.ok) throw new Error(`Reddit Comments error: ${res.status}`);
      return res.json();
    }
  }

  async getThreadContent(permalink: string): Promise<any> {
    if (typeof window !== 'undefined') {
      const url = new URL(`${window.location.origin}${this.BASE_URL}/comments/none`); // We use a dummy postId
      url.searchParams.set('permalink', permalink);
      
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`Reddit Thread Content error: ${res.status}`);
      return res.json();
    } else {
      const res = await fetch(`https://www.reddit.com${permalink}.json`);
      if (!res.ok) throw new Error(`Reddit Thread Content error: ${res.status}`);
      return res.json();
    }
  }

  async fetchRaw(url: string): Promise<any> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Reddit fetchRaw error: ${res.status}`);
    return res.json();
  }
}
