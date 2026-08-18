import { getSupabaseClient } from '../lib/supabase.js';
import { getAccountContext } from '../account-context.js';

function context(roles=['owner','planner']){
  const account=getAccountContext();
  const supabase=getSupabaseClient();
  if(!account?.organization?.id || !supabase) throw new Error('Bedrijfsomgeving ontbreekt.');
  if(!roles.includes(account?.membership?.role)) throw new Error('Geen toegang tot aanvragen.');
  return {account,supabase};
}

async function authenticatedApi(path,body={}){
  const {account,supabase}=context(['owner','planner']);
  const {data:{session}}=await supabase.auth.getSession();
  if(!session?.access_token) throw new Error('Log opnieuw in om deze koppeling te gebruiken.');
  const response=await fetch(path,{method:'POST',headers:{'content-type':'application/json',Authorization:`Bearer ${session.access_token}`,'x-optero-organization-id':account.organization.id},body:JSON.stringify(body)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error||'Actie mislukt.');
  return data;
}

export async function listLeads(status=''){
  const {account,supabase}=context();
  const {data,error}=await supabase.rpc('list_leads_v130',{p_organization_id:account.organization.id,p_status:status||null});
  if(error) throw error;
  return Array.isArray(data)?data:[];
}

export async function getLead(leadId){
  const {account,supabase}=context();
  const {data,error}=await supabase.rpc('get_lead_v130',{p_organization_id:account.organization.id,p_lead_id:leadId});
  if(error) throw error;
  return Array.isArray(data)?(data[0]||null):data;
}

export async function updateLead(leadId,status,customerId=''){
  const {account,supabase}=context();
  const {data,error}=await supabase.rpc('update_lead_v130',{p_organization_id:account.organization.id,p_lead_id:leadId,p_status:status,p_customer_id:customerId||null});
  if(error) throw error;
  return data;
}

export async function syncMailboxes(){
  return authenticatedApi('/api/mailbox/sync',{});
}

export async function startMailboxOAuth(provider){
  const data=await authenticatedApi('/api/mailbox/oauth-start',{provider});
  if(!data?.url) throw new Error('Provider gaf geen koppeladres terug.');
  window.location.assign(data.url);
}

export async function connectImapMailbox(payload={}){
  return authenticatedApi('/api/mailbox/imap-connect',payload);
}

export async function listMailboxConnections(){
  const {account,supabase}=context(['owner']);
  const {data,error}=await supabase.rpc('list_mailbox_connections_v130',{p_organization_id:account.organization.id});
  if(error) throw error;
  return Array.isArray(data)?data:[];
}

export async function disconnectMailbox(connectionId){
  const {account,supabase}=context(['owner']);
  const {data,error}=await supabase.rpc('disconnect_mailbox_v130',{p_organization_id:account.organization.id,p_connection_id:connectionId});
  if(error) throw error;
  return data;
}

export async function listWebsiteSources(){
  const {account,supabase}=context(['owner']);
  const {data,error}=await supabase.rpc('list_website_sources_v130',{p_organization_id:account.organization.id});
  if(error) throw error;
  return Array.isArray(data)?data:[];
}

export async function createWebsiteSource(name='Bedrijfswebsite'){
  return authenticatedApi('/api/integrations/website-source',{name});
}

export async function deactivateWebsiteSource(sourceId){
  const {account,supabase}=context(['owner']);
  const {data,error}=await supabase.rpc('deactivate_website_source_v130',{p_organization_id:account.organization.id,p_source_id:sourceId});
  if(error) throw error;
  return data;
}
