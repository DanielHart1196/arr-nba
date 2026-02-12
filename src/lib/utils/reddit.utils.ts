import type { RedditComment } from '../types/nba';

export function normalizeMascot(name: string): string {
  const s = (name || '').toLowerCase();
  if (s.includes('trail blazers')) return 'Trail Blazers';
  return name;
}

export function createPairKey(awayName: string, homeName: string): string {
  return [normalizeMascot(awayName), normalizeMascot(homeName)].sort().join('|');
}

export function formatTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = Math.max(0, now - (Number(timestamp) || 0));
  if (diff < 60) return 'just now';
  const mins = Math.floor(diff / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Optimized sorting that doesn't clone entire trees
export function sortComments(comments: RedditComment[], choice: 'new' | 'top'): RedditComment[] {
  const cmp = (a: RedditComment, b: RedditComment) => {
    if (choice === 'top') return (b?.score ?? 0) - (a?.score ?? 0);
    return (b?.created_utc ?? 0) - (a?.created_utc ?? 0);
  };
  
  // Sort in place for better performance
  return comments.sort(cmp);
}

// Memoized comment sorting to avoid unnecessary re-sorts
const commentSortCache = new Map<string, RedditComment[]>();
export function getSortedComments(comments: RedditComment[], choice: 'new' | 'top'): RedditComment[] {
  const cacheKey = `${choice}_${comments.length}_${comments.map(c => c.id).join('_')}`;
  
  if (commentSortCache.has(cacheKey)) {
    return commentSortCache.get(cacheKey)!;
  }
  
  const sorted = sortComments([...comments], choice);
  commentSortCache.set(cacheKey, sorted);
  
  // Cleanup cache if it gets too large
  if (commentSortCache.size > 50) {
    const keysToDelete = Array.from(commentSortCache.keys()).slice(0, 25);
    keysToDelete.forEach(key => commentSortCache.delete(key));
  }
  
  return sorted;
}
