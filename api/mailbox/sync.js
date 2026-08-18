import { authenticatedContext, sendError } from '../_lib/optera-auth.js';
import { decryptSecret, encryptSecret } from '../_lib/mailbox-crypto.js';
import { fetchInboxMessages, refreshAccessToken } from '../_lib/mailbox-provider.js';
import { fetchRecentImapMessages } from '../_lib/imap-client.js';

function normalizeText(value, max = 5000) { return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max); }
function digits(value) { return String(value || '').replace(/\D/g, ''); }
function looksAutomated(message = {}) {
  const hay = `${message.fromEmail} ${message.fromName} ${message.subject}`.toLowerCase();
  return /(no-?reply|do-?not-?reply|mailer-daemon|postmaster|undeliver|newsletter|nieuwsbrief|factuur|invoice|payment|betaling|orderbevestiging|delivery|bezorg)/i.test(hay);
}
function extractPhone(text) {
  const match = String(text || '').match(/(?:\+31|0031|0)\s*6(?:[\s.-]*\d){8}|(?:\+31|0031|0)\s*(?:10|20|23|24|26|30|33|35|36|38|40|43|45|46|50|53|55|58|70|71|72|73|74|75|76|77|78|79)(?:[\s.-]*\d){7}/);
  return match ? normalizeText(match[0], 80) : '';
}
function extractPostalCode(text) {
  const match = String(text || '').match(/\b\d{4}\s?[A-Za-z]{2}\b/);
  return match ? match[0].toUpperCase().replace(/^(\d{4})\s?([A-Z]{2})$/, '$1 $2') : '';
}
async function existingCustomer(admin, organizationId, email, phone) {
  if (email) {
    const { data } = await admin.from('customers').select('id').eq('organization_id', organizationId).ilike('email', email).limit(1);
    if (data?.length) return data[0].id;
  }
  const wanted = digits(phone);
  if (wanted) {
    const { data } = await admin.from('customers').select('id,phone').eq('organization_id', organizationId).limit(500);
    const found = (data || []).find((row) => digits(row.phone) === wanted);
    if (found) return found.id;
  }
  return '';
}

async function syncConnection(admin, connection) {
  let credential = decryptSecret(connection.refresh_token_enc);
  let messages=[];
  if(connection.provider==='imap'){
    messages=await fetchRecentImapMessages({host:connection.imap_host,port:connection.imap_port,username:connection.imap_username,password:credential});
  }else{
    const tokenData = await refreshAccessToken(connection.provider, credential);
    if (tokenData.refresh_token) credential = tokenData.refresh_token;
    messages = await fetchInboxMessages(connection.provider, tokenData.access_token);
  }
  let created = 0;
  for (const message of messages) {
    const fromEmail = normalizeText(message.fromEmail, 240).toLowerCase();
    if (!fromEmail || fromEmail === String(connection.mailbox_email || '').toLowerCase() || looksAutomated(message)) continue;
    const snippet = normalizeText(message.snippet, 5000);
    const phone = extractPhone(snippet);
    const postalCode = extractPostalCode(snippet);
    if (await existingCustomer(admin, connection.organization_id, fromEmail, phone)) continue;
    const providerMessageId = normalizeText(message.id, 500);
    const { data: duplicate, error: duplicateError } = await admin.from('lead_intakes')
      .select('id')
      .eq('organization_id', connection.organization_id)
      .eq('source_type', 'email')
      .eq('provider_message_id', providerMessageId)
      .limit(1);
    if (duplicateError) throw duplicateError;
    if (duplicate?.length) continue;
    const { error } = await admin.from('lead_intakes').insert({
      organization_id: connection.organization_id,
      source_type: 'email',
      source_label: connection.mailbox_email,
      status: 'new',
      name: normalizeText(message.fromName || fromEmail.split('@')[0], 160),
      email: fromEmail,
      phone,
      postal_code: postalCode,
      subject: normalizeText(message.subject || 'E-mailaanvraag', 240),
      message: snippet,
      provider_message_id: providerMessageId,
      source_payload: { provider: connection.provider, providerId: message.providerId || '', mailbox: connection.mailbox_email },
      received_at: message.receivedAt || new Date().toISOString()
    });
    if (error && error.code !== '23505') throw error;
    if (!error) created += 1;
  }
  await admin.from('mailbox_connections').update({
    refresh_token_enc: encryptSecret(credential),
    status: 'connected',
    last_synced_at: new Date().toISOString(),
    last_sync_error: null,
    updated_at: new Date().toISOString()
  }).eq('id', connection.id).eq('organization_id', connection.organization_id);
  return created;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST toegestaan.' });
  try {
    const { membership, admin } = await authenticatedContext(req, ['owner','planner']);
    const { data: connections, error } = await admin.from('mailbox_connections')
      .select('id,organization_id,provider,mailbox_email,refresh_token_enc,status,imap_host,imap_port,imap_username')
      .eq('organization_id', membership.organization_id)
      .eq('status', 'connected');
    if (error) throw error;
    let created = 0;
    const failures = [];
    for (const connection of connections || []) {
      try { created += await syncConnection(admin, connection); }
      catch (syncError) {
        failures.push({ id: connection.id, error: syncError?.message || 'Synchronisatie mislukt' });
        await admin.from('mailbox_connections').update({
          last_sync_error: syncError?.message || 'Synchronisatie mislukt',
          updated_at: new Date().toISOString()
        }).eq('id', connection.id).eq('organization_id', connection.organization_id);
      }
    }
    return res.status(200).json({ ok: true, created, failures });
  } catch (error) {
    return sendError(res, error, 'Mailbox synchroniseren mislukt.');
  }
}
