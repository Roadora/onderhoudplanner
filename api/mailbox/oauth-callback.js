import { adminClient, envConfig } from '../_lib/optera-auth.js';
import { encryptSecret, verifyState } from '../_lib/mailbox-crypto.js';
import { exchangeAuthorizationCode, mailboxProfile, oauthRedirectUri } from '../_lib/mailbox-provider.js';

function redirect(res, path) {
  return res.redirect(302, path);
}

export default async function handler(req, res) {
  const base = envConfig().appUrl || `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['x-forwarded-host'] || req.headers.host}`;
  try {
    if (req.query?.error) throw new Error(String(req.query.error_description || req.query.error));
    const code = String(req.query?.code || '');
    const state = verifyState(req.query?.state);
    if (!code) throw new Error('OAuth-code ontbreekt.');
    const admin = adminClient();
    const { data: membership, error: memberError } = await admin
      .from('organization_members')
      .select('organization_id,user_id,role,status')
      .eq('organization_id', state.organizationId)
      .eq('user_id', state.userId)
      .eq('role', 'owner')
      .eq('status', 'active')
      .maybeSingle();
    if (memberError || !membership) throw new Error('De eigenaar kon niet worden gecontroleerd.');

    const tokenData = await exchangeAuthorizationCode(state.provider, code, oauthRedirectUri(req));
    if (!tokenData.refresh_token) throw new Error('Provider gaf geen refresh-token terug. Verwijder de toestemming bij de provider en koppel opnieuw.');
    const profile = await mailboxProfile(state.provider, tokenData.access_token);
    if (!profile.email) throw new Error('E-mailadres van de mailbox kon niet worden bepaald.');

    const payload = {
      organization_id: state.organizationId,
      provider: state.provider,
      mailbox_email: String(profile.email).toLowerCase(),
      display_name: profile.displayName || '',
      status: 'connected',
      refresh_token_enc: encryptSecret(tokenData.refresh_token),
      scopes: String(tokenData.scope || '').split(/\s+/).filter(Boolean),
      connected_by: state.userId,
      last_sync_error: null,
      updated_at: new Date().toISOString()
    };
    const { error } = await admin.from('mailbox_connections').upsert(payload, { onConflict: 'organization_id,provider,mailbox_email' });
    if (error) throw error;
    return redirect(res, `${base}/?mailbox=connected`);
  } catch (error) {
    console.error('Mailbox OAuth callback mislukt', error);
    return redirect(res, `${base}/?mailbox=error&reason=${encodeURIComponent(error?.message || 'Koppelen mislukt')}`);
  }
}
