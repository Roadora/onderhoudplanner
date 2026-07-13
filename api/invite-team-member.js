import { createClient } from '@supabase/supabase-js';

function send(res, status, error, details) {
  return res.status(status).json({ error, ...(details ? { details } : {}) });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, 'Alleen POST toegestaan.');

  try {
    const url = process.env.VITE_SUPABASE_URL;
    const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const appUrl = process.env.VITE_APP_URL || 'https://onderhoudplanner.vercel.app';

    if (!url || !anon || !service) {
      console.error('Invite config missing', { url: Boolean(url), anon: Boolean(anon), service: Boolean(service) });
      return send(res, 500, 'Serverconfiguratie voor uitnodigingen ontbreekt.');
    }

    const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!token) return send(res, 401, 'Niet ingelogd.');

    const userClient = createClient(url, anon, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const admin = createClient(url, service, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData?.user) {
      console.error('Invite auth error', userError);
      return send(res, 401, 'Ongeldige of verlopen sessie. Log opnieuw in.');
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    const role = String(req.body?.role || 'technician');
    if (!email || !['planner', 'technician'].includes(role)) {
      return send(res, 400, 'Controleer het e-mailadres en de gekozen rol.');
    }
    if (email === String(userData.user.email || '').trim().toLowerCase()) {
      return send(res, 409, 'Je kunt je eigen e-mailadres niet als medewerker uitnodigen.');
    }

    // Leid de organisatie uitsluitend server-side af uit het ingelogde account.
    // Vertrouw dus niet op een organizationId uit de browser.
    // Controleer het lidmaatschap met de sessie van de ingelogde gebruiker.
    // De RLS-policy staat een gebruiker altijd toe zijn eigen actieve lidmaatschap te lezen.
    // Hierdoor is de eigenaarcontrole niet afhankelijk van de vraag of een nieuwe sb_secret_
    // sleutel of een legacy service_role-key door de REST-client als bypass wordt behandeld.
    const { data: memberships, error: membershipError } = await userClient
      .from('organization_members')
      .select('organization_id,role,status')
      .eq('user_id', userData.user.id)
      .eq('status', 'active');

    const membership = Array.isArray(memberships)
      ? memberships.find((item) => item.role === 'owner') || memberships[0]
      : null;

    if (membershipError) {
      console.error('Invite membership lookup failed', membershipError);
      return send(res, 500, 'De eigenaar kon niet worden gecontroleerd. Log opnieuw in en probeer het nogmaals.');
    }
    if (!membership) return send(res, 403, 'Je account is niet gekoppeld aan een actieve bedrijfsomgeving.');
    if (membership.role !== 'owner') return send(res, 403, 'Alleen de eigenaar kan medewerkers uitnodigen.');

    const organizationId = membership.organization_id;

    const { count, error: countError } = await userClient
      .from('organization_members')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'active');
    if (countError) {
      console.error('Invite team count failed', countError);
      return send(res, 500, 'Het aantal teamleden kon niet worden gecontroleerd.');
    }
    if ((count || 0) >= 5) return send(res, 409, 'Het Team-pakket ondersteunt maximaal 5 gebruikers.');

    const { data: existingMember, error: existingMemberError } = await userClient
      .from('organization_members')
      .select('user_id')
      .eq('organization_id', organizationId)
      .eq('status', 'active');
    if (existingMemberError) {
      console.error('Invite existing member lookup failed', existingMemberError);
      return send(res, 500, 'Bestaande medewerkers konden niet worden gecontroleerd.');
    }

    if (existingMember?.length) {
      const userIds = existingMember.map((item) => item.user_id);
      const { data: usersResult, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (usersError) {
        console.error('Invite auth users lookup failed', usersError);
        return send(res, 500, 'Bestaande accounts konden niet worden gecontroleerd.');
      }
      const alreadyMember = usersResult.users.some(
        (user) => userIds.includes(user.id) && String(user.email || '').toLowerCase() === email,
      );
      if (alreadyMember) return send(res, 409, 'Dit e-mailadres is al als medewerker actief.');
    }

    const { error: revokeError } = await admin
      .from('team_invitations')
      .update({ status: 'revoked' })
      .eq('organization_id', organizationId)
      .eq('email', email)
      .eq('status', 'pending');
    if (revokeError) {
      console.error('Invite revoke failed', revokeError);
      return send(res, 500, 'Een eerdere uitnodiging kon niet worden vervangen.');
    }

    const { data: invitation, error: invitationError } = await admin
      .from('team_invitations')
      .insert({
        organization_id: organizationId,
        email,
        role,
        invited_by: userData.user.id,
      })
      .select('id')
      .single();
    if (invitationError) {
      console.error('Invite insert failed', invitationError);
      return send(res, 500, 'De uitnodiging kon niet worden opgeslagen.');
    }

    const redirectTo = `${appUrl.replace(/\/$/, '')}?team_invite=${encodeURIComponent(invitation.id)}`;
    const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: { team_invitation_id: invitation.id },
    });

    if (inviteError) {
      console.error('Invite email failed', inviteError);
      await admin.from('team_invitations').delete().eq('id', invitation.id);
      const message = /already|registered|exists/i.test(inviteError.message || '')
        ? 'Voor dit e-mailadres bestaat al een account. Uitnodigen van bestaande accounts voegen we in een volgende stap toe.'
        : 'De uitnodigingsmail kon niet worden verstuurd.';
      return send(res, 500, message);
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Unexpected invite error', error);
    return send(res, 500, error?.message || 'Uitnodigen mislukt.');
  }
}
