import { writable, derived } from 'svelte/store';
import type { RedditComment, RedditPost, RedditThreadMapping } from '../types/nba';
import { nbaService } from '../services/nba.service';
import { createPairKey } from '../utils/reddit.utils';

interface RedditState {
  threads: Map<string, RedditPost>;
  comments: Map<string, RedditComment[]>;
  mapping: RedditThreadMapping;
  loading: boolean;
}

function createRedditStore() {
  const { subscribe, set, update } = writable<RedditState>({
    threads: new Map(),
    comments: new Map(),
    mapping: {},
    loading: false
  });

  return {
    subscribe,
    
    async loadIndex() {
      try {
        const mapping = await nbaService.getRedditIndex();
        update(state => ({ ...state, mapping }));
      } catch (error) {
        console.error('Failed to load Reddit index:', error);
      }
    },
    
    async searchThread(awayName: string, homeName: string, type: 'live' | 'post') {
      update(state => ({ ...state, loading: true }));
      
      try {
        const result = await nbaService.searchRedditThread({
          type,
          awayCandidates: [awayName],
          homeCandidates: [homeName]
        });
        
        if (result.post) {
          const pairKey = createPairKey(awayName, homeName);
          const sortKey = type === 'post' ? 'top' : 'new';
          const threadKey = `${pairKey}|${sortKey}|${type.toUpperCase()}`;
          
          update(state => {
            const newThreads = new Map(state.threads);
            newThreads.set(threadKey, result.post!);
            return { ...state, threads: newThreads };
          });
        }
      } catch (error) {
        console.error('Failed to search Reddit thread:', error);
      } finally {
        update(state => ({ ...state, loading: false }));
      }
    },
    
    async loadComments(postId: string, sort: 'new' | 'top' = 'new', permalink?: string) {
      try {
        const result = await nbaService.getRedditComments(postId, sort, permalink);
        const commentKey = `${postId}|${sort}`;
        
        update(state => {
          const newComments = new Map(state.comments);
          newComments.set(commentKey, result.comments || []);
          return { ...state, comments: newComments };
        });
      } catch (error) {
        console.error('Failed to load Reddit comments:', error);
      }
    },
    
    getThread(pairKey: string, type: 'LIVE' | 'POST'): RedditPost | null {
      const sort = type === 'POST' ? 'top' : 'new';
      const key = `${pairKey}|${sort}|${type}`;
      let thread: RedditPost | null = null;
      
      subscribe(state => {
        thread = state.threads.get(key) || null;
      })();
      
      return thread;
    },
    
    getComments(postId: string, sort: 'new' | 'top' = 'new'): RedditComment[] {
      const key = `${postId}|${sort}`;
      let comments: RedditComment[] = [];
      
      subscribe(state => {
        comments = state.comments.get(key) || [];
      })();
      
      return comments;
    },
    
    reset() {
      set({
        threads: new Map(),
        comments: new Map(),
        mapping: {},
        loading: false
      });
    }
  };
}

export const redditStore = createRedditStore();
