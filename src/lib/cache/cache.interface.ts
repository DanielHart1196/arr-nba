export interface ICache {
  get<T>(key: string): T | Promise<T | null> | null;
  set<T>(key: string, data: T, ttl?: number): void | Promise<void>;
  getOrFetch<T>(key: string, fetcher: () => Promise<T>, ttl?: number): Promise<T>;
  delete(key: string): boolean | Promise<boolean>;
  clear(): void | Promise<void>;
  cleanup?(): void;
}
