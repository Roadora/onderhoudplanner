let accountContext = null;

export function setAccountContext(context) {
  accountContext = context ? { ...context } : null;
  window.dispatchEvent(new CustomEvent('maintenance-account-changed', {
    detail: accountContext
  }));
}

export function getAccountContext() {
  return accountContext;
}

export function getOrganizationId() {
  return accountContext?.organization?.id || '';
}

export function updateAccountContext(patch = {}) {
  if (!accountContext) return null;
  accountContext = { ...accountContext, ...patch };
  window.dispatchEvent(new CustomEvent('maintenance-account-changed', {
    detail: accountContext
  }));
  return accountContext;
}
