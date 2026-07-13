import { createClient } from '@supabase/supabase-js';
import { PUBLIC_RUNTIME_CONFIG, hasSupabaseConfig } from '../config.js';

let client = null;

export function getSupabaseClient() {
  if (!hasSupabaseConfig()) return null;
  if (!client) {
    client = createClient(
      PUBLIC_RUNTIME_CONFIG.supabaseUrl,
      PUBLIC_RUNTIME_CONFIG.supabasePublishableKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          flowType: 'implicit'
        }
      }
    );
  }
  return client;
}
