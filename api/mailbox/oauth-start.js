import { randomBytes } from 'node:crypto';
import { authenticatedContext, sendError } from '../_lib/optera-auth.js';
import { signState } from '../_lib/mailbox-crypto.js';
import { oauthAuthorizationUrl, oauthRedirectUri } from '../_lib/mailbox-provider.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST toegestaan.' });
  try {
    const provider = String(req.body?.provider || '');
    if (!['microsoft','google'].includes(provider)) return res.status(400).json({ error: 'Kies Microsoft of Google.' });
    const { user, membership } = await authenticatedContext(req, ['owner']);
    const redirectUri = oauthRedirectUri(req);
    const state = signState({
      provider,
      organizationId: membership.organization_id,
      userId: user.id,
      nonce: randomBytes(16).toString('base64url'),
      exp: Date.now() + 10 * 60 * 1000
    });
    return res.status(200).json({ url: oauthAuthorizationUrl(provider, state, redirectUri) });
  } catch (error) {
    return sendError(res, error, 'Mailboxkoppeling starten mislukt.');
  }
}
