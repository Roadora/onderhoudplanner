import { createHash, randomBytes } from 'node:crypto';
import { authenticatedContext, sendError } from '../_lib/optera-auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST toegestaan.' });
  try {
    const { user, membership, admin } = await authenticatedContext(req, ['owner']);
    const name = String(req.body?.name || 'Bedrijfswebsite').trim().slice(0, 120) || 'Bedrijfswebsite';
    const publicKey = `src_${randomBytes(12).toString('base64url')}`;
    const secret = randomBytes(32).toString('base64url');
    const secretHash = createHash('sha256').update(secret).digest('hex');
    const { data, error } = await admin.from('website_intake_sources').insert({
      organization_id: membership.organization_id,
      name,
      public_key: publicKey,
      secret_hash: secretHash,
      created_by: user.id
    }).select('id,name,public_key').single();
    if (error) throw error;
    return res.status(201).json({ id: data.id, name: data.name, sourceKey: data.public_key, sourceSecret: secret });
  } catch (error) {
    return sendError(res, error, 'Websitekoppeling maken mislukt.');
  }
}
