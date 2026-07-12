import { getOrganizationId } from '../account-context.js';

let writeObserver = null;

function scopedKey(key) {
  const organizationId = getOrganizationId();
  return organizationId ? `${key}::organization::${organizationId}` : key;
}

/**
 * Lokale cache per bedrijfsaccount.
 *
 * Vanaf v0.8.2 is Supabase de hoofdopslag. localStorage blijft bewust bestaan
 * als snelle cache en als tijdelijke buffer wanneer een apparaat even offline is.
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

  getUnscopedItem(key) {
    return window.localStorage.getItem(key);
  },

  setUnscopedItem(key, value) {
    window.localStorage.setItem(key, value);
  },

  removeUnscopedItem(key) {
    window.localStorage.removeItem(key);
  },

  hasScopedItem(key) {
    return window.localStorage.getItem(scopedKey(key)) !== null;
  },

  scopedKey
});

export function observeLocalWrites(observer) {
  writeObserver = typeof observer === 'function' ? observer : null;
  return () => {
    if (writeObserver === observer) writeObserver = null;
  };
}

export function claimLegacyLocalData(primaryKey, legacyKeys = []) {
  if (localRepository.hasScopedItem(primaryKey)) {
    return { status: 'already_scoped' };
  }

  const organizationId = getOrganizationId();
  if (!organizationId) return { status: 'no_account' };

  const claimKey = `${primaryKey}::legacy_claimed_by`;
  const claimedBy = localRepository.getUnscopedItem(claimKey);
  if (claimedBy && claimedBy !== organizationId) {
    return { status: 'claimed_by_other_account' };
  }

  const sourceKey = [primaryKey, ...legacyKeys].find(
    key => localRepository.getUnscopedItem(key)
  );
  if (!sourceKey) return { status: 'nothing_to_claim' };

  const raw = localRepository.getUnscopedItem(sourceKey);
  localRepository.setItem(primaryKey, raw, { silent: true });
  localRepository.setUnscopedItem(claimKey, organizationId);
  return { status: 'claimed', sourceKey };
}
