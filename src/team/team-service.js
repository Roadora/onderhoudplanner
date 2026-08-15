import { getSupabaseClient } from '../lib/supabase.js';
import { getAccountContext } from '../account-context.js';

const TOKEN_PARAM = 'employee_activation';

export function getActivationToken() {
  return new URL(window.location.href).searchParams.get(TOKEN_PARAM) || '';
}

export function hasEmployeeActivation() {
  return Boolean(getActivationToken());
}

export async function completeTeamInvitation(activationToken, displayName) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('complete_team_invitation', {
    p_activation_token: activationToken,
    p_display_name: displayName
  });
  if (error) throw error;
  return data;
}

export function clearActivationUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete(TOKEN_PARAM);
  url.searchParams.delete('auth');
  history.replaceState({}, '', url.pathname + url.search);
}

export async function listTeamMembers() {
  const account = getAccountContext();
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('list_team_members', { p_organization_id: account.organization.id });
  if (error) throw error;
  return data || [];
}

export async function listPendingInvitations() {
  const account = getAccountContext();
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.from('team_invitations').select('id,email,role,status,delivery_status,last_sent_at,last_email_error,email_attempts,expires_at,created_at').eq('organization_id',account.organization.id).eq('status','pending').order('created_at',{ascending:false});
  if (error) throw error;
  return data || [];
}

export async function inviteTeamMember(email, role) {
  const supabase = getSupabaseClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const response = await fetch('/api/invite-team-member', {
    method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${sessionData.session?.access_token || ''}`},
    body:JSON.stringify({email,role})
  });
  const payload = await response.json().catch(()=>({}));
  if (!response.ok) throw new Error(payload.error || 'Uitnodigen mislukt.');
  return payload;
}
