import { getAccountContext, getOrganizationId } from '../account-context.js';

let writeObserver = null;

function userScope() {
  const account = getAccountContext();
  return {
    organizationId: account?.organization?.id || getOrganizationId() || '',
    userId: account?.user?.id || account?.membership?.user_id || ''
  };
}

function scopedKey(key) {
  const { organizationId, userId } = userScope();
  if (organizationId && userId) return `${key}::organization::${organizationId}::user::${userId}`;
  if (organizationId) return `${key}::organization::${organizationId}`;
  return key;
}

function legacyOrganizationScopedKey(key) {
  const { organizationId } = userScope();
  return organizationId ? `${key}::organization::${organizationId}` : key;
}

/**
 * Lokale cache per bedrijf én gebruiker.
 * Supabase blijft de hoofdopslag; localStorage is alleen cache/offline-buffer.
 * Door ook user_id te scopen kan een monteur nooit de browsercache van een
 * eigenaar/planner van hetzelfde bedrijf erven.
 */
export const localRepository = Object.freeze({
  getItem(key) {
    return window.localStorage.getItem(scopedKey(key));
  },

  setItem(key, value, { silent = false } = {}) {
    window.localStorage.setItem(scopedKey(key), value);
    if (!silent && typeof writeObserver === 'function') {
      writeObserver({ key, value, scopedKey: scopedKey(key) });
    }
  },

  removeItem(key, { silent = false } = {}) {
    window.localStorage.removeItem(scopedKey(key));
    if (!silent && typeof writeObserver === 'function') {
      writeObserver({ key, value: null, scopedKey: scopedKey(key) });
    }
  },

  getUnscopedItem(key) { return window.localStorage.getItem(key); },
  setUnscopedItem(key, value) { window.localStorage.setItem(key, value); },
  removeUnscopedItem(key) { window.localStorage.removeItem(key); },
  hasScopedItem(key) { return window.localStorage.getItem(scopedKey(key)) !== null; },
  scopedKey,
  legacyOrganizationScopedKey
});

export function migrateOrganizationCacheToCurrentUser(primaryKey) {
  if (localRepository.hasScopedItem(primaryKey)) return { status: 'already_user_scoped' };
  const account = getAccountContext();
  if (!account?.organization?.id || !account?.user?.id) return { status: 'no_account' };
  if (!['owner', 'planner'].includes(account?.membership?.role)) return { status: 'role_not_allowed' };
  const legacyKey = localRepository.legacyOrganizationScopedKey(primaryKey);
  const raw = window.localStorage.getItem(legacyKey);
  if (!raw) return { status: 'nothing_to_migrate' };
  localRepository.setItem(primaryKey, raw, { silent: true });
  return { status: 'migrated', legacyKey };
}

export function clearCurrentUserLocalData() {
  const { organizationId, userId } = userScope();
  if (!organizationId || !userId) return 0;
  const suffix = `::organization::${organizationId}::user::${userId}`;
  const keys = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (key?.endsWith(suffix)) keys.push(key);
  }
  keys.forEach(key => window.localStorage.removeItem(key));
  return keys.length;
}

export function observeLocalWrites(observer) {
  writeObserver = typeof observer === 'function' ? observer : null;
  return () => { if (writeObserver === observer) writeObserver = null; };
}

export function claimLegacyLocalData(primaryKey, legacyKeys = []) {
  if (localRepository.hasScopedItem(primaryKey)) return { status: 'already_scoped' };
  const account = getAccountContext();
  const organizationId = account?.organization?.id;
  if (!organizationId || !account?.user?.id) return { status: 'no_account' };
  if (!['owner', 'planner'].includes(account?.membership?.role)) return { status: 'role_not_allowed' };

  const claimKey = `${primaryKey}::legacy_claimed_by`;
  const claimedBy = localRepository.getUnscopedItem(claimKey);
  if (claimedBy && claimedBy !== organizationId) return { status: 'claimed_by_other_account' };

  const sourceKey = [primaryKey, ...legacyKeys].find(key => localRepository.getUnscopedItem(key));
  if (!sourceKey) return { status: 'nothing_to_claim' };

  const raw = localRepository.getUnscopedItem(sourceKey);
  localRepository.setItem(primaryKey, raw, { silent: true });
  localRepository.setUnscopedItem(claimKey, organizationId);
  return { status: 'claimed', sourceKey };
}
