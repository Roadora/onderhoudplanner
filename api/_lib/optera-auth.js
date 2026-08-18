import { createClient } from '@supabase/supabase-js';

export function envConfig() {
  return {
    url: process.env.VITE_SUPABASE_URL || '',
    anon: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '',
    service: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    appUrl: (process.env.VITE_APP_URL || '').replace(/\/$/, '')
  };
}

export function adminClient() {
  const { url, service } = envConfig();
  if (!url || !service) throw new Error('Supabase serverconfiguratie ontbreekt.');
  return createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function authenticatedContext(req, allowedRoles = ['owner', 'planner']) {
  const { url, anon } = envConfig();
  if (!url || !anon) throw new Error('Supabase publieke serverconfiguratie ontbreekt.');
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    const error = new Error('Niet ingelogd.');
    error.status = 401;
    throw error;
  }
  const client = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData?.user) {
    const error = new Error('Ongeldige of verlopen sessie.');
    error.status = 401;
    throw error;
  }
  const organizationId = String(req.headers['x-optero-organization-id'] || req.body?.organizationId || '').trim();
  let membershipQuery = client
    .from('organization_members')
    .select('organization_id,role,status')
    .eq('user_id', userData.user.id)
    .eq('status', 'active');
  if (organizationId) membershipQuery = membershipQuery.eq('organization_id', organizationId);
  const { data: memberships, error: membershipError } = await membershipQuery;
  if (membershipError) throw membershipError;
  const membership = Array.isArray(memberships)
    ? memberships.find((item) => allowedRoles.includes(item.role)) || null
    : null;
  if (!membership || !allowedRoles.includes(membership.role)) {
    const error = new Error('Geen rechten voor deze actie.');
    error.status = 403;
    throw error;
  }
  return { user: userData.user, membership, client, admin: adminClient() };
}

export function sendError(res, error, fallback = 'Actie mislukt.') {
  const status = Number(error?.status) || 500;
  console.error(fallback, error);
  return res.status(status).json({ error: error?.message || fallback });
}
