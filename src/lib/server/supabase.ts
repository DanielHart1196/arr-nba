import { createClient } from '@supabase/supabase-js';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { browser } from '$app/environment';

const supabaseUrl = env.PUBLIC_SUPABASE_URL || publicEnv.PUBLIC_SUPABASE_URL || '';
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.PUBLIC_SUPABASE_ANON_KEY || publicEnv.PUBLIC_SUPABASE_ANON_KEY || '';

if (!browser && (!supabaseUrl || !supabaseKey)) {
  console.warn('Supabase credentials missing. Supabase caching will be disabled.');
}

export const supabase = (!browser && supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey)
  : null;
