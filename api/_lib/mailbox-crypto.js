import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

function encryptionKey() {
  const raw = String(process.env.OPTERO_MAILBOX_TOKEN_KEY || '').trim();
  let key;
  if (/^[0-9a-f]{64}$/i.test(raw)) key = Buffer.from(raw, 'hex');
  else {
    try { key = Buffer.from(raw, 'base64'); } catch { key = Buffer.alloc(0); }
  }
  if (key.length !== 32) throw new Error('OPTERO_MAILBOX_TOKEN_KEY moet een 32-byte sleutel zijn (base64 of 64 hex tekens).');
  return key;
}

export function encryptSecret(value) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value || ''), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptSecret(payload) {
  const [ivText, tagText, dataText] = String(payload || '').split('.');
  if (!ivText || !tagText || !dataText) throw new Error('Ongeldige versleutelde mailboxsleutel.');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataText, 'base64url')), decipher.final()]).toString('utf8');
}

function stateSecret() {
  const value = String(process.env.OPTERO_OAUTH_STATE_SECRET || process.env.OPTERO_MAILBOX_TOKEN_KEY || '');
  if (value.length < 24) throw new Error('OPTERO_OAUTH_STATE_SECRET ontbreekt of is te kort.');
  return value;
}

export function signState(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', stateSecret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifyState(token) {
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature) throw new Error('Ongeldige OAuth-status.');
  const expected = createHmac('sha256', stateSecret()).update(body).digest();
  const provided = Buffer.from(signature, 'base64url');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) throw new Error('OAuth-status kon niet worden geverifieerd.');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  if (!payload?.exp || Date.now() > Number(payload.exp)) throw new Error('OAuth-koppeling is verlopen. Start opnieuw.');
  return payload;
}
