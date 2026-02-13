import type { ICache } from './cache.interface';

export class SupabaseCache implements ICache {
  private supabase: any = null;
  private tableName: string;

  constructor(tableName: string = 'reddit_cache') {
    this.tableName = tableName;
  }

  private async getSupabase() {
    if (this.supabase) return this.supabase;
    if (typeof window !== 'undefined') return null;

    try {
      const { supabase } = await import('../server/supabase');
      this.supabase = supabase;
      return this.supabase;
    } catch (e) {
      return null;
    }
  }

  async cleanup(): Promise<void> {
    const client = await this.getSupabase();
    if (!client) return;
    await client.from(this.tableName).delete().lt('expires_at', new Date().toISOString());
  }

  async set<T>(key: string, data: T, ttl: number): Promise<void> {
    const client = await this.getSupabase();
    if (!client) return;

    const expires_at = new Date(Date.now() + ttl).toISOString();
    
    try {
      const { error } = await client
        .from(this.tableName)
        .upsert({
          key,
          data,
          expires_at,
          updated_at: new Date().toISOString()
        }, { onConflict: 'key' });

      if (error) console.error('Supabase Cache Set Error:', error);
    } catch (e) {
      console.error('Supabase Cache Set Exception:', e);
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const client = await this.getSupabase();
    if (!client) return null;

    try {
      const { data, error } = await client
        .from(this.tableName)
        .select('data, expires_at')
        .eq('key', key)
        .single();

      if (error || !data) return null;

      // Check expiration
      if (new Date(data.expires_at) < new Date()) {
        // Optionally delete expired entry asynchronously
        client.from(this.tableName).delete().eq('key', key).then();
        return null;
      }

      return data.data as T;
    } catch (e) {
      console.error('Supabase Cache Get Exception:', e);
      return null;
    }
  }

  async getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number
  ): Promise<T> {
    // Try Supabase first
    const cached = await this.get<T>(key);
    if (cached !== null) {
      console.log(`Supabase Cache Hit: ${key}`);
      return cached;
    }

    console.log(`Supabase Cache Miss: ${key}. Fetching...`);
    const freshData = await fetcher();
    
    // Save to Supabase (don't await to avoid blocking)
    this.set(key, freshData, ttl).catch(err => 
      console.error(`Failed to save ${key} to Supabase:`, err)
    );

    return freshData;
  }

  async delete(key: string): Promise<boolean> {
    const client = await this.getSupabase();
    if (!client) return false;
    const { error } = await client.from(this.tableName).delete().eq('key', key);
    return !error;
  }

  async clear(): Promise<void> {
    const client = await this.getSupabase();
    if (!client) return;
    await client.from(this.tableName).delete().neq('key', '');
  }
}
