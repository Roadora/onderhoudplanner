import { createClient } from '@supabase/supabase-js';
import { createHash, randomBytes } from 'node:crypto';

function send(res, status, error, details) {
  return res.status(status).json({ error, ...(details ? { details } : {}) });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, 'Alleen POST toegestaan.');

  try {
    const url = process.env.VITE_SUPABASE_URL;
    const anon = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const forwardedProto = req.headers['x-forwarded-proto'] || 'https';
    const forwardedHost = req.headers['x-forwarded-host'] || req.headers.host || 'optero.nl';
    const appUrl = process.env.VITE_APP_URL || `${forwardedProto}://${forwardedHost}`;

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
    const { data: organization, error: organizationError } = await userClient
      .from('organizations')
      .select('name')
      .eq('id', organizationId)
      .single();
    if (organizationError) {
      console.error('Invite organization lookup failed', organizationError);
      return send(res, 500, 'De bedrijfsomgeving kon niet worden geladen.');
    }
    const organizationName = String(organization?.name || 'je bedrijf');

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

    const userIds = (existingMember || []).map((item) => item.user_id);
    const { data: usersResult, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersError) {
      console.error('Invite auth users lookup failed', usersError);
      return send(res, 500, 'Bestaande accounts konden niet worden gecontroleerd.');
    }
    const existingAuthUser = usersResult.users.find(
      (user) => String(user.email || '').toLowerCase() === email,
    );
    if (existingAuthUser && userIds.includes(existingAuthUser.id)) {
      return send(res, 409, 'Dit e-mailadres is al als medewerker actief.');
    }

    const activationToken = randomBytes(32).toString('base64url');
    const activationTokenHash = createHash('sha256').update(activationToken).digest('hex');

    // Hergebruik een bestaande openstaande uitnodiging in plaats van deze eerst te
    // verwijderen of te revoken. Dat voorkomt conflicten met de unieke combinatie
    // (organization_id, email, status) en werkt via de RLS-rechten van de eigenaar.
    const { data: pendingInvitations, error: pendingLookupError } = await userClient
      .from('team_invitations')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('email', email)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(1);
    if (pendingLookupError) {
      console.error('Invite pending lookup failed', pendingLookupError);
      return send(res, 500, 'Een eerdere uitnodiging kon niet worden gecontroleerd.');
    }

    let invitation;
    const existingPending = pendingInvitations?.[0];
    if (existingPending) {
      const { data: refreshedInvitation, error: refreshError } = await userClient
        .from('team_invitations')
        .update({
          role,
          invited_by: userData.user.id,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          accepted_at: null,
          activation_token_hash: activationTokenHash,
          activation_created_at: new Date().toISOString(),
          delivery_status: 'sending',
          last_email_error: null,
          email_attempts: 0,
        })
        .eq('id', existingPending.id)
        .select('id')
        .single();
      if (refreshError) {
        console.error('Invite refresh failed', refreshError);
        return send(res, 500, 'De bestaande uitnodiging kon niet worden vernieuwd.');
      }
      invitation = refreshedInvitation;
    } else {
      const { data: newInvitation, error: invitationError } = await userClient
        .from('team_invitations')
        .insert({
          organization_id: organizationId,
          email,
          role,
          invited_by: userData.user.id,
          activation_token_hash: activationTokenHash,
          activation_created_at: new Date().toISOString(),
          delivery_status: 'sending',
          last_email_error: null,
          email_attempts: 0,
        })
        .select('id')
        .single();
      if (invitationError) {
        console.error('Invite insert failed', invitationError);
        return send(res, 500, 'De uitnodiging kon niet worden opgeslagen.');
      }
      invitation = newInvitation;
    }

    const redirectTo = `${appUrl.replace(/\/$/, '')}?employee_activation=${encodeURIComponent(activationToken)}`;
    const roleLabel = role === 'planner' ? 'planner' : 'monteur';
    let mailError = null;

    if (existingAuthUser) {
      // Bestaande accounts ontvangen de recovery-template, maar met Optero-context in metadata.
      const existingMetadata = existingAuthUser.user_metadata || {};
      const { error: metadataError } = await admin.auth.admin.updateUserById(existingAuthUser.id, {
        user_metadata: {
          ...existingMetadata,
          invited_as_team_member: true,
          optero_invite_company: organizationName,
          optero_invite_role: roleLabel,
        },
      });
      if (metadataError) {
        console.error('Invite metadata update failed', metadataError);
        mailError = metadataError;
      } else {
        const { error: recoveryError } = await admin.auth.resetPasswordForEmail(email, { redirectTo });
        mailError = recoveryError;
      }
    } else {
      const { error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: {
          invited_as_team_member: true,
          optero_invite_company: organizationName,
          optero_invite_role: roleLabel,
        },
      });
      mailError = inviteError;
    }

    if (mailError) {
      console.error('Invite email failed', mailError);
      const rawMessage = String(mailError?.message || 'Onbekende e-mailfout');
      const isRateLimit = /rate limit|too many/i.test(rawMessage);
      const safeError = isRateLimit
        ? 'De e-maillimiet is tijdelijk bereikt. Probeer de uitnodiging later opnieuw te versturen.'
        : 'De uitnodiging staat klaar, maar de e-mail kon niet worden verzonden.';
      await userClient
        .from('team_invitations')
        .update({
          delivery_status: 'mail_failed',
          last_email_error: safeError,
          email_attempts: 1,
        })
        .eq('id', invitation.id);
      return send(res, isRateLimit ? 429 : 502, safeError);
    }

    const { error: deliveryUpdateError } = await userClient
      .from('team_invitations')
      .update({
        delivery_status: 'sent',
        last_sent_at: new Date().toISOString(),
        last_email_error: null,
        email_attempts: 1,
      })
      .eq('id', invitation.id);
    if (deliveryUpdateError) console.error('Invite delivery status update failed', deliveryUpdateError);

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Unexpected invite error', error);
    return send(res, 500, error?.message || 'Uitnodigen mislukt.');
  }
}
