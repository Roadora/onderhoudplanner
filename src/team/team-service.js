import { getSupabaseClient } from '../lib/supabase.js';
import { getAccountContext } from '../account-context.js';

export async function acceptInvitationFromUrl() {
  const url = new URL(window.location.href);
  const invitationId = url.searchParams.get('team_invite');
  if (!invitationId) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('accept_team_invitation', { p_invitation_id: invitationId });
  if (error) throw error;
  url.searchParams.delete('team_invite');
  history.replaceState({}, '', url.pathname + url.search + url.hash);
  return data;
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
  const { data, error } = await supabase.from('team_invitations').select('id,email,role,status,expires_at,created_at').eq('organization_id',account.organization.id).eq('status','pending').order('created_at',{ascending:false});
  if (error) throw error;
  return data || [];
}

export async function inviteTeamMember(email, role) {
  const account = getAccountContext();
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
