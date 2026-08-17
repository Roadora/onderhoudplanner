select
 to_regclass('public.surveys') is not null as surveys_table,
 to_regclass('public.survey_photos') is not null as survey_photos_table,
 to_regprocedure('public.get_survey_v110(uuid,text)') is not null as get_survey_rpc,
 to_regprocedure('public.upsert_survey_v110(uuid,text,text,text,text,text,text)') is not null as save_survey_rpc,
 exists(select 1 from storage.buckets where id='opname-fotos' and public=false) as private_photo_bucket;
