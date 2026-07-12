import { getOrganizationId } from '../account-context.js';

function scopedKey(key) {
  const organizationId = getOrganizationId();
  return organizationId ? `${key}::organization::${organizationId}` : key;
}

/**
 * Tijdelijke lokale repository voor v0.8.1.
 *
 * De gegevens worden nog niet naar Supabase gestuurd, maar zijn vanaf deze
 * versie wel per bedrijfsaccount gescheiden. v0.8.2 vervangt deze repository
 * door online tabellen zonder dat de schermen opnieuw ontworpen hoeven worden.
 */
export const localRepository = Object.freeze({
  getItem(key) {
    return window.localStorage.getItem(scopedKey(key));
  },

  setItem(key, value) {
    window.localStorage.setItem(scopedKey(key), value);
  },

  removeItem(key) {
    window.localStorage.removeItem(scopedKey(key));
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
  localRepository.setItem(primaryKey, raw);
  localRepository.setUnscopedItem(claimKey, organizationId);
  return { status: 'claimed', sourceKey };
}
