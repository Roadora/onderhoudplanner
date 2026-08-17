import { getSupabaseClient } from '../lib/supabase.js';
import { getAccountContext } from '../account-context.js';

function context(){
  const account=getAccountContext();
  const supabase=getSupabaseClient();
  if(account?.membership?.role!=='owner') throw new Error('Alleen de eigenaar heeft toegang tot offertes en bedragen.');
  if(!account?.organization?.id || !supabase) throw new Error('Bedrijfsomgeving ontbreekt.');
  return {account,supabase};
}

export async function getQuoteBySurvey(appointmentId){
  const {account,supabase}=context();
  const {data,error}=await supabase.rpc('get_quote_by_survey_v122',{p_organization_id:account.organization.id,p_survey_appointment_id:appointmentId});
  if(error) throw error;
  return Array.isArray(data)?(data[0]||null):data;
}

export async function getQuote(quoteId){
  const {account,supabase}=context();
  const {data,error}=await supabase.rpc('get_quote_v122',{p_organization_id:account.organization.id,p_quote_id:quoteId});
  if(error) throw error;
  return Array.isArray(data)?(data[0]||null):data;
}

export async function saveQuote(payload={}){
  const {account,supabase}=context();
  const {data,error}=await supabase.rpc('upsert_quote_v122',{
    p_organization_id:account.organization.id,
    p_quote_id:payload.id||null,
    p_survey_appointment_id:payload.surveyAppointmentId,
    p_customer_id:payload.customerId,
    p_status:payload.status||'draft',
    p_items:payload.items||[],
    p_notes:payload.notes||''
  });
  if(error) throw error;
  return data;
}
