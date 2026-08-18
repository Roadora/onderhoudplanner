import { createHash, timingSafeEqual } from 'node:crypto';
import { adminClient, sendError } from '../_lib/optera-auth.js';

function clean(value, max = 500) {
  return String(value || '').trim().slice(0, max);
}

function normalizePayload(body = {}) {
  return {
    name: clean(body.name || body.naam, 160),
    email: clean(body.email, 240).toLowerCase(),
    phone: clean(body.phone || body.telefoon, 80),
    address: clean(body.address || body.adres, 240),
    postal_code: clean(body.postalCode || body.postcode, 40),
    city: clean(body.city || body.plaats || body.woonplaats, 120),
    subject: clean(body.subject || body.onderwerp || body.requestType || body.soortAanvraag || 'Websiteaanvraag', 240),
    message: clean(body.message || body.bericht || body.notes || body.opmerking, 5000),
    source_payload: {
      requestType: clean(body.requestType || body.soortAanvraag, 120),
      systems: clean(body.systems || body.aantalSystemen, 80),
      rooms: clean(body.rooms || body.ruimtes, 300),
      page: clean(body.page || body.sourcePage, 500)
    }
  };
}

function hash(value) {
  return createHash('sha256').update(String(value || '')).digest();
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST toegestaan.' });
  try {
    const sourceKey = clean(req.headers['x-optero-source-key'] || req.body?.sourceKey, 200);
    const secret = clean(req.headers['x-optero-source-secret'] || req.body?.sourceSecret, 300);
    if (!sourceKey || !secret) return res.status(401).json({ error: 'Websitekoppeling ontbreekt.' });

    // Honeypot: bots vullen dit vaak in; we doen alsof de aanvraag is ontvangen.
    if (clean(req.body?.website || req.body?._website, 200)) return res.status(200).json({ ok: true });

    const admin = adminClient();
    const { data: source, error: sourceError } = await admin
      .from('website_intake_sources')
      .select('id,organization_id,name,secret_hash,active')
      .eq('public_key', sourceKey)
      .eq('active', true)
      .maybeSingle();
    if (sourceError) throw sourceError;
    if (!source) return res.status(401).json({ error: 'Onbekende websitekoppeling.' });

    const expected = Buffer.from(source.secret_hash, 'hex');
    const provided = hash(secret);
    if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
      return res.status(401).json({ error: 'Ongeldige websitekoppeling.' });
    }

    const lead = normalizePayload(req.body || {});
    if (!lead.name && !lead.email && !lead.phone) return res.status(400).json({ error: 'Naam, e-mail of telefoonnummer is verplicht.' });

    const { data, error } = await admin.from('lead_intakes').insert({
      organization_id: source.organization_id,
      source_type: 'website',
      source_label: source.name || 'Website',
      ...lead,
      received_at: new Date().toISOString()
    }).select('id').single();
    if (error) throw error;
    return res.status(201).json({ ok: true, requestId: data.id });
  } catch (error) {
    return sendError(res, error, 'Websiteaanvraag opslaan mislukt.');
  }
}
