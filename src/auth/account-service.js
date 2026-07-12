import { getSupabaseClient } from '../lib/supabase.js';
import { getAccountContext, updateAccountContext } from '../account-context.js';

function cleanName(value, fallback) {
  const name = String(value || '').trim();
  return name || fallback;
}

export async function ensureAccountWorkspace(user) {
  const supabase = getSupabaseClient();
  if (!supabase || !user) throw new Error('Accountconfiguratie ontbreekt.');

  const metadata = user.user_metadata || {};
  const contactName = cleanName(metadata.contact_name, user.email?.split('@')[0] || 'Gebruiker');
  const companyName = cleanName(metadata.company_name, 'Mijn onderhoudsbedrijf');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      email: user.email || '',
      full_name: contactName,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' })
    .select('id,email,full_name,created_at,updated_at')
    .single();

  if (profileError) throw enhanceSetupError(profileError);

  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('organization_id,role,created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (membershipError) throw enhanceSetupError(membershipError);

  let organizationId = membership?.organization_id || null;
  let role = membership?.role || 'owner';

  if (!organizationId) {
    const { data: ownedOrganization, error: ownedError } = await supabase
      .from('organizations')
      .select('id,name,owner_user_id,subscription_status,trial_ends_at,created_at')
      .eq('owner_user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (ownedError) throw enhanceSetupError(ownedError);

    let organization = ownedOrganization;
    if (!organization) {
      const { data: created, error: createError } = await supabase
        .from('organizations')
        .insert({ name: companyName, owner_user_id: user.id })
        .select('id,name,owner_user_id,subscription_status,trial_ends_at,created_at')
        .single();

      if (createError?.code === '23505') {
        const { data: existingAfterRace, error: refetchError } = await supabase
          .from('organizations')
          .select('id,name,owner_user_id,subscription_status,trial_ends_at,created_at')
          .eq('owner_user_id', user.id)
          .single();
        if (refetchError) throw enhanceSetupError(refetchError);
        organization = existingAfterRace;
      } else if (createError) {
        throw enhanceSetupError(createError);
      } else {
        organization = created;
      }
    }

    organizationId = organization.id;
    const { error: memberCreateError } = await supabase
      .from('organization_members')
      .upsert({
        organization_id: organizationId,
        user_id: user.id,
        role: 'owner'
      }, { onConflict: 'organization_id,user_id' });

    if (memberCreateError) throw enhanceSetupError(memberCreateError);
  }

  const { data: organization, error: organizationError } = await supabase
    .from('organizations')
    .select('id,name,owner_user_id,subscription_status,trial_ends_at,created_at,updated_at')
    .eq('id', organizationId)
    .single();

  if (organizationError) throw enhanceSetupError(organizationError);

  return {
    user,
    profile,
    organization,
    membership: {
      organization_id: organizationId,
      user_id: user.id,
      role
    }
  };
}

export async function updateOrganizationName(name) {
  const supabase = getSupabaseClient();
  const account = getAccountContext();
  const clean = String(name || '').trim();
  if (!supabase || !account?.organization?.id || !clean) return;

  const { data, error } = await supabase
    .from('organizations')
    .update({ name: clean, updated_at: new Date().toISOString() })
    .eq('id', account.organization.id)
    .select('id,name,owner_user_id,subscription_status,trial_ends_at,created_at,updated_at')
    .single();

  if (error) throw error;
  updateAccountContext({ organization: data });
  return data;
}

export async function updateProfileName(fullName) {
  const supabase = getSupabaseClient();
  const account = getAccountContext();
  const clean = String(fullName || '').trim();
  if (!supabase || !account?.user?.id) return;

  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name: clean, updated_at: new Date().toISOString() })
    .eq('id', account.user.id)
    .select('id,email,full_name,created_at,updated_at')
    .single();

  if (error) throw error;
  updateAccountContext({ profile: data });
  return data;
}

function enhanceSetupError(error) {
  const message = String(error?.message || 'Onbekende databasefout');
  if (/relation .* does not exist/i.test(message) || /schema cache/i.test(message)) {
    const setupError = new Error('De Supabase-tabellen ontbreken nog. Voer eerst supabase/schema.sql uit in de SQL Editor.');
    setupError.code = 'SUPABASE_SCHEMA_MISSING';
    setupError.cause = error;
    return setupError;
  }
  return error;
}
