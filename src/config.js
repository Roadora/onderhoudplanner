export const APP_VERSION = '0.8.0 Technische basis';

// Bewust gelijk aan v0.7, zodat bestaande lokale data automatisch behouden blijft.
export const STORAGE_KEY = 'onderhoudplanner_v07_pilot';
export const LEGACY_STORAGE_KEYS = ['onderhoudplanner_v06_empty'];

// Deze waarden worden in stap 2 gebruikt. Er staan nooit geheime sleutels in de frontend.
const runtimeEnv = import.meta.env ?? {};

export const PUBLIC_RUNTIME_CONFIG = Object.freeze({
  supabaseUrl: runtimeEnv.VITE_SUPABASE_URL || '',
  supabaseAnonKey: runtimeEnv.VITE_SUPABASE_ANON_KEY || ''
});
