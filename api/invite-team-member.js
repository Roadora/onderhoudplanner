import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Alleen POST toegestaan.' });
  try {
    const url = process.env.VITE_SUPABASE_URL;
    const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const appUrl = process.env.VITE_APP_URL || 'https://onderhoudplanner.vercel.app';
    if (!url || !anon || !service) return res.status(500).json({ error: 'Serverconfiguratie ontbreekt.' });

    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'Niet ingelogd.' });
    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) return res.status(401).json({ error: 'Ongeldige sessie.' });

    const email = String(req.body?.email || '').trim().toLowerCase();
    const role = String(req.body?.role || 'technician');
    const organizationId = String(req.body?.organizationId || '');
    if (!email || !organizationId || !['planner','technician'].includes(role)) return res.status(400).json({ error: 'Controleer e-mailadres en rol.' });

    const { data: membership } = await admin.from('organization_members').select('role,status').eq('organization_id',organizationId).eq('user_id',userData.user.id).maybeSingle();
    if (!membership || membership.status !== 'active' || !['owner','planner'].includes(membership.role)) return res.status(403).json({ error: 'Geen rechten om medewerkers uit te nodigen.' });

    const { count } = await admin.from('organization_members').select('*',{count:'exact',head:true}).eq('organization_id',organizationId).eq('status','active');
    if ((count || 0) >= 5) return res.status(409).json({ error: 'Het Team-pakket ondersteunt maximaal 5 gebruikers.' });

    await admin.from('team_invitations').update({status:'revoked'}).eq('organization_id',organizationId).eq('email',email).eq('status','pending');
    const { data: invitation, error: invitationError } = await admin.from('team_invitations').insert({organization_id:organizationId,email,role,invited_by:userData.user.id}).select('id').single();
    if (invitationError) throw invitationError;

    const redirectTo = `${appUrl.replace(/\/$/,'')}?team_invite=${invitation.id}`;
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { team_invitation_id: invitation.id } });
    if (inviteError) {
      await admin.from('team_invitations').delete().eq('id',invitation.id);
      throw inviteError;
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error?.message || 'Uitnodigen mislukt.' });
  }
}
