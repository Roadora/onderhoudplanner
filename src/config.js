export const APP_VERSION = '0.12.8 Offerteoverzicht';

// Bewust gelijk aan v0.7, zodat bestaande lokale data eenmalig aan het eerste
// bedrijfsaccount op dit apparaat gekoppeld kan worden.
export const STORAGE_KEY = 'onderhoudplanner_v07_pilot';
export const LEGACY_STORAGE_KEYS = ['onderhoudplanner_v06_empty'];

const runtimeEnv = import.meta.env ?? {};

export const PUBLIC_RUNTIME_CONFIG = Object.freeze({
  supabaseUrl: runtimeEnv.VITE_SUPABASE_URL || '',
  supabasePublishableKey:
    runtimeEnv.VITE_SUPABASE_PUBLISHABLE_KEY ||
    runtimeEnv.VITE_SUPABASE_ANON_KEY || '',
  appUrl: runtimeEnv.VITE_APP_URL || ''
});

export function hasSupabaseConfig() {
  return Boolean(
    PUBLIC_RUNTIME_CONFIG.supabaseUrl &&
    PUBLIC_RUNTIME_CONFIG.supabasePublishableKey
  );
}

export function appBaseUrl() {
  if (PUBLIC_RUNTIME_CONFIG.appUrl) {
    return PUBLIC_RUNTIME_CONFIG.appUrl.replace(/\/?$/, '/');
  }
  return new URL(import.meta.env.BASE_URL || '/', window.location.origin).toString();
}

export function authRedirectUrl(mode = '') {
  const url = new URL(appBaseUrl());
  if (mode) url.searchParams.set('auth', mode);
  return url.toString();
}
