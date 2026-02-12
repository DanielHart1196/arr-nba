export interface ICache {
  get<T>(key: string): T | null;
  set<T>(key: string, data: T, ttl?: number): void;
  getOrFetch<T>(key: string, fetcher: () => Promise<T>, ttl?: number): Promise<T>;
  delete(key: string): boolean;
  clear(): void;
  cleanup(): void;
}
