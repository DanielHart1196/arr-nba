import type { RedditPost, RedditComment, RedditThreadMapping } from '$lib/types/nba';
import { normalizeMascot } from '$lib/utils/reddit.utils';

export class RedditTransformer {
  transformSearch(
    json: any,
    type: 'live' | 'post',
    eventDate?: string,
    awayCandidates: string[] = [],
    homeCandidates: string[] = []
  ): { post?: RedditPost } {
    const items = json?.data?.children ?? [];
    const now = Date.now() / 1000;
    
    // Stricter freshness:
    // For LIVE threads, must be within last 24 hours.
    // For POST threads, must be within last 36 hours.
    const maxAge = type === 'post' ? 36 * 3600 : 24 * 3600;
    const targetTs = eventDate ? Math.floor(new Date(eventDate).getTime() / 1000) : NaN;
    const useHistoricRanking = Number.isFinite(targetTs);
    const inWindow = (createdUtc: number): boolean => {
      if (!useHistoricRanking) {
        // If we do not have game date context, do not hard-expire PGT candidates.
        if (type === 'post') return true;
        return (now - createdUtc) <= maxAge;
      }
      const target = targetTs as number;
      if (type === 'live') {
        // Game threads are often posted hours before tipoff.
        return createdUtc >= target - (12 * 3600) && createdUtc <= target + (18 * 3600);
      }
      // For PGT, rely on search relevance + title matching instead of hard time window.
      return true;
    };
    const fresh = items.filter((i: any) => inWindow(i?.data?.created_utc ?? 0));

    const normalize = (s: string) => (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const expandCandidates = (candidates: string[]): string[] => {
      const out = new Set<string>();
      for (const raw of candidates ?? []) {
        const n = normalize(raw);
        if (!n) continue;
        out.add(n);
        const parts = n.split(' ').filter(Boolean);
        if (parts.length > 1) {
          out.add(parts[parts.length - 1]); // mascot, e.g. "lakers"
          out.add(parts.map((p) => p[0]).join('')); // abbreviation-ish, e.g. "lal"
        }
      }
      return [...out];
    };
    const titleContainsAny = (title: string, candidates: string[]) => {
      const t = normalize(title);
      return (candidates ?? [])
        .map((c) => normalize(c))
        .filter(Boolean)
        .some((needle) => t.includes(needle));
    };
    const awayTerms = expandCandidates(awayCandidates);
    const homeTerms = expandCandidates(homeCandidates);
    
    const modeFiltered = fresh.filter((i: any) => {
      const title = (i?.data?.title || '').toLowerCase();
      const isPGT = title.includes('post game thread') || title.includes('post-game thread') || title.includes('postgame thread');
      
      if (type === 'post') {
        return isPGT;
      } else {
        return title.includes('game thread') && !isPGT;
      }
    });
    const strictFiltered = modeFiltered.filter((i: any) => {
      const title = (i?.data?.title || '').toLowerCase();
      const hasAway = titleContainsAny(title, awayTerms);
      const hasHome = titleContainsAny(title, homeTerms);
      return hasAway && hasHome;
    });
    const filtered = strictFiltered.length > 0 ? strictFiltered : modeFiltered;

    // For historical lookup, choose the closest thread date to the game date.
    // Otherwise pick the latest fresh thread.
    const sorted = filtered.sort((a: any, b: any) => {
      const aTs = a?.data?.created_utc ?? 0;
      const bTs = b?.data?.created_utc ?? 0;
      if (useHistoricRanking) {
        const aDist = Math.abs(aTs - (targetTs as number));
        const bDist = Math.abs(bTs - (targetTs as number));
        if (aDist !== bDist) return aDist - bDist;
      }
      return bTs - aTs;
    });

    const mapped = sorted.map((i: any) => ({
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
    const now = Date.now() / 1000;
    
    for (const line of lines) {
      const m = /\[([^\]]+)\]\((https?:\/\/[^\)]+)\)/.exec(line);
      if (!m) continue;
      const title = m[1];
      const url = m[2];
      const lower = title.toLowerCase();
      const isPGT =
        lower.includes('post game thread') ||
        lower.includes('post-game thread') ||
        lower.includes('postgame thread');
      const parts = title.split(':')[1]?.trim() ?? title;
      const splitToken = /\s+at\s+/i.test(parts) ? /\s+at\s+/i : (/\s+vs\.?\s+/i.test(parts) ? /\s+vs\.?\s+/i : null);
      const [awayPart, homePart] = splitToken ? parts.split(splitToken).map((s) => s?.trim()) : [undefined, undefined];
      if (!awayPart || !homePart) continue;
      
      const key = [normalizeMascot(awayPart), normalizeMascot(homePart)].sort().join('|');
      const idMatch = /comments\/([a-z0-9]+)\//.exec(url);
      const id = idMatch?.[1] ?? '';

      // For index-based discovery, we should be very strict.
      // If it's a PGT, it really shouldn't be more than a day old if it's appearing in today's index,
      // but just to be safe against yesterday's games lingering in the index, we will let RedditService handle it if needed.
      // However, we can add a basic timestamp check here if we had the creation time of the post, 
      // but the index body doesn't usually have it.
      
      mapping[key] = mapping[key] || {};
      const post: RedditPost = { id, title, url };
      
      if (isPGT) {
        // Keep first parsed PGT for stability.
        if (!mapping[key].pgt) mapping[key].pgt = post;
      } else {
        if (!mapping[key].gdt) mapping[key].gdt = post;
      }
    }
    
    // Knicks fallback logic (preserving existing behavior)
    // NOTE: This fallback ID '1r2i5hi' is likely very old now.
    // If we're on Feb 13 2026, we should probably remove or update this.
    const knicksKey = ['Knicks', '76ers'].sort().join('|');
    if (!mapping[knicksKey]?.pgt) {
      // mapping[knicksKey] = mapping[knicksKey] || {};
      // mapping[knicksKey].pgt = {
      //   id: '1r2i5hi',
      //   title: 'Post Game Thread: Knicks vs 76ers',
      //   url: 'https://www.reddit.com/r/nba/comments/1r2i5hi/post_game_thread_the_new_york_knicks_3520_defeat/'
      // };
    }
    
    return { mapping };
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
