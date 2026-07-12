-- Optionele controle na cloud_schema_v082.sql
select
  to_regclass('public.company_settings') is not null as company_settings_ok,
  to_regclass('public.customers') is not null as customers_ok,
  to_regclass('public.installations') is not null as installations_ok,
  to_regclass('public.appointments') is not null as appointments_ok,
  to_regprocedure('public.get_organization_state(uuid)') is not null as read_rpc_ok,
  to_regprocedure('public.replace_organization_state(uuid,bigint,jsonb,boolean)') is not null as write_rpc_ok;

select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where oid in (
  'public.company_settings'::regclass,
  'public.customers'::regclass,
  'public.installations'::regclass,
  'public.appointments'::regclass
)
order by relname;
