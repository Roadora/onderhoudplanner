select exists(select 1 from information_schema.columns where table_schema='public' and table_name='surveys' and column_name='details' and data_type='jsonb') as surveys_details_jsonb;
select to_regprocedure('public.list_surveys_v112(uuid)') is not null as list_surveys_v112_exists;
select to_regprocedure('public.get_survey_v112(uuid,text)') is not null as get_survey_v112_exists;
select to_regprocedure('public.upsert_survey_v112(uuid,text,text,text,text,text,text,jsonb)') is not null as upsert_survey_v112_exists;
select has_function_privilege('authenticated','public.upsert_survey_v112(uuid,text,text,text,text,text,text,jsonb)','EXECUTE') as authenticated_can_use_survey_v112;
