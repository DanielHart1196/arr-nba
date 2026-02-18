import type { ICache } from './cache.interface';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class APICache implements ICache {
  private cache = new Map<string, CacheEntry<any>>();
  private defaultTTL = 5 * 60 * 1000; // 5 minutes
  private maxEntries = 400;

  set<T>(key: string, data: T, ttl: number = this.defaultTTL): void {
    // Keep the cache bounded to avoid unbounded memory growth over long sessions.
    if (!this.cache.has(key) && this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) this.cache.delete(oldestKey);
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  private pendingRequests = new Map<string, Promise<any>>();

  async getOrFetch<T>(
    key: string, 
    fetcher: () => Promise<T>, 
    ttl?: number
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) return cached;
    
    // Check if there is already a pending request for this key
    const pending = this.pendingRequests.get(key);
    if (pending) return pending;

    const promise = fetcher().then(data => {
      this.set(key, data, ttl);
      this.pendingRequests.delete(key);
      return data;
    }).catch(err => {
      this.pendingRequests.delete(key);
      throw err;
    });

    this.pendingRequests.set(key, promise);
    return promise;
  }

  clear(): void {
    this.cache.clear();
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  size(): number {
    return this.cache.size;
  }

  // Cleanup expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// Singleton instance
export const apiCache = new APICache();
