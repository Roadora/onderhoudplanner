import { getSupabaseClient } from '../lib/supabase.js';
import { getAccountContext } from '../account-context.js';

function context(){
  const account=getAccountContext();
  const supabase=getSupabaseClient();
  if(!account?.organization?.id || !supabase) throw new Error('Bedrijfsomgeving ontbreekt.');
  return {account,supabase};
}

export async function listWorkOrders(){
  const {account,supabase}=context();
  const {data,error}=await supabase.rpc('list_work_orders_v122',{p_organization_id:account.organization.id});
  if(error) throw error;
  return data||[];
}

export async function getWorkOrder(workOrderId){
  const {account,supabase}=context();
  const {data,error}=await supabase.rpc('get_work_order_v122',{p_organization_id:account.organization.id,p_work_order_id:workOrderId});
  if(error) throw error;
  return Array.isArray(data)?(data[0]||null):data;
}

export async function getWorkOrderByAppointment(appointmentId){
  const {account,supabase}=context();
  const {data,error}=await supabase.rpc('get_work_order_by_appointment_v122',{p_organization_id:account.organization.id,p_appointment_id:appointmentId});
  if(error) throw error;
  return Array.isArray(data)?(data[0]||null):data;
}

export async function getWorkOrderByQuote(quoteId){
  const {account,supabase}=context();
  const {data,error}=await supabase.rpc('get_work_order_by_quote_v122',{p_organization_id:account.organization.id,p_quote_id:quoteId});
  if(error) throw error;
  return Array.isArray(data)?(data[0]||null):data;
}

export async function saveWorkOrder(workOrderId,payload={}){
  const {account,supabase}=context();
  const {data,error}=await supabase.rpc('upsert_work_order_v122',{
    p_organization_id:account.organization.id,
    p_work_order_id:workOrderId||null,
    p_quote_id:payload.quoteId||null,
    p_survey_appointment_id:payload.surveyAppointmentId||null,
    p_customer_id:payload.customerId||null,
    p_installation_id:payload.installationId||null,
    p_title:payload.title||'Werkorder',
    p_status:payload.status||'concept',
    p_details:payload.details||{}
  });
  if(error) throw error;
  return data;
}

export async function linkWorkOrderAppointment(workOrderId,appointmentId){
  const {account,supabase}=context();
  const {data,error}=await supabase.rpc('link_work_order_appointment_v122',{
    p_organization_id:account.organization.id,
    p_work_order_id:workOrderId,
    p_appointment_id:appointmentId
  });
  if(error) throw error;
  return data;
}

export async function updateWorkOrderExecution(workOrderId,execution,status='in_progress'){
  const {account,supabase}=context();
  const {data,error}=await supabase.rpc('update_work_order_execution_v122',{
    p_organization_id:account.organization.id,
    p_work_order_id:workOrderId,
    p_execution:execution||{},
    p_status:status
  });
  if(error) throw error;
  return data;
}
