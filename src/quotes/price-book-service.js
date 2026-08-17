import { getSupabaseClient } from '../lib/supabase.js';
import { getAccountContext } from '../account-context.js';

function context(){
  const account=getAccountContext();
  const supabase=getSupabaseClient();
  if(account?.membership?.role!=='owner') throw new Error('Alleen de eigenaar heeft toegang tot het prijzenboek.');
  if(!account?.organization?.id || !supabase) throw new Error('Bedrijfsomgeving ontbreekt.');
  return {account,supabase};
}

export async function listPriceBook(){
  const {account,supabase}=context();
  const {data,error}=await supabase.rpc('list_price_book_v125',{p_organization_id:account.organization.id});
  if(error) throw error;
  return Array.isArray(data)?data:[];
}

export async function savePriceBookItem(payload={}){
  const {account,supabase}=context();
  const {data,error}=await supabase.rpc('upsert_price_book_item_v125',{
    p_organization_id:account.organization.id,
    p_item_id:payload.id||null,
    p_category:payload.category||'system',
    p_label:payload.label||'',
    p_system_type:payload.systemType||'',
    p_brand:payload.brand||'',
    p_model:payload.model||'',
    p_unit:payload.unit||'stuk',
    p_unit_price:Number(payload.unitPrice)||0,
    p_active:payload.active!==false
  });
  if(error) throw error;
  return data;
}

export async function deletePriceBookItem(itemId){
  const {account,supabase}=context();
  const {data,error}=await supabase.rpc('delete_price_book_item_v125',{
    p_organization_id:account.organization.id,
    p_item_id:itemId
  });
  if(error) throw error;
  return data;
}
