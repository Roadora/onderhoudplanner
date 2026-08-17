import { getSupabaseClient } from '../lib/supabase.js';
import { getAccountContext } from '../account-context.js';

const BUCKET='opname-fotos';

export async function listSurveys(){
  const account=getAccountContext();
  const supabase=getSupabaseClient();
  const {data,error}=await supabase.rpc('list_surveys_v110',{p_organization_id:account.organization.id});
  if(error) throw error;
  return data||[];
}

export async function getSurvey(appointmentId){
  const account=getAccountContext();
  const supabase=getSupabaseClient();
  const {data,error}=await supabase.rpc('get_survey_v110',{p_organization_id:account.organization.id,p_appointment_id:appointmentId});
  if(error) throw error;
  return Array.isArray(data)?(data[0]||null):data;
}

export async function saveSurvey(appointmentId,payload){
  const account=getAccountContext();
  const supabase=getSupabaseClient();
  const {data,error}=await supabase.rpc('upsert_survey_v110',{
    p_organization_id:account.organization.id,
    p_appointment_id:appointmentId,
    p_purpose:payload.purpose||'nieuwe_installatie',
    p_scope:payload.scope||'',
    p_findings:payload.findings||'',
    p_technical_notes:payload.technicalNotes||'',
    p_status:payload.status||'planned'
  });
  if(error) throw error;
  return data;
}

export async function listSurveyPhotos(appointmentId){
  const account=getAccountContext();
  const supabase=getSupabaseClient();
  const {data,error}=await supabase.rpc('list_survey_photos_v110',{p_organization_id:account.organization.id,p_appointment_id:appointmentId});
  if(error) throw error;
  const rows=data||[];
  return Promise.all(rows.map(async row=>{
    const {data:signed}=await supabase.storage.from(BUCKET).createSignedUrl(row.storage_path,3600);
    return {...row,url:signed?.signedUrl||''};
  }));
}

export async function uploadSurveyPhotos(appointmentId,files){
  const account=getAccountContext();
  const supabase=getSupabaseClient();
  const accepted=[...(files||[])].filter(file=>file?.type?.startsWith('image/'));
  for(const file of accepted){
    if(file.size>8*1024*1024) throw new Error(`${file.name} is groter dan 8 MB.`);
    const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';
    const id=crypto.randomUUID();
    const path=`${account.organization.id}/${appointmentId}/${id}.${ext}`;
    const {error:uploadError}=await supabase.storage.from(BUCKET).upload(path,file,{upsert:false,contentType:file.type,cacheControl:'3600'});
    if(uploadError) throw uploadError;
    const {error:registerError}=await supabase.rpc('register_survey_photo_v110',{p_organization_id:account.organization.id,p_appointment_id:appointmentId,p_storage_path:path,p_caption:''});
    if(registerError){
      await supabase.storage.from(BUCKET).remove([path]).catch(()=>{});
      throw registerError;
    }
  }
}

export async function deleteSurveyPhoto(photoId,storagePath){
  const account=getAccountContext();
  const supabase=getSupabaseClient();
  const {error}=await supabase.rpc('delete_survey_photo_v110',{p_organization_id:account.organization.id,p_photo_id:photoId});
  if(error) throw error;
  if(storagePath) await supabase.storage.from(BUCKET).remove([storagePath]);
}
