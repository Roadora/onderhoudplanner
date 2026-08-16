-- Optero v0.10.0 verificatie
select
  to_regprocedure('public.merge_organization_state_v100(uuid,bigint,jsonb,boolean)') is not null as merge_rpc_ok,
  to_regprocedure('public.delete_appointments_v100(uuid,bigint,text[])') is not null as delete_appointments_ok,
  to_regprocedure('public.delete_installation_v100(uuid,bigint,text)') is not null as delete_installation_ok,
  to_regprocedure('public.delete_customer_v100(uuid,bigint,text)') is not null as delete_customer_ok,
  to_regprocedure('public.clear_operational_data_v100(uuid,bigint)') is not null as clear_data_ok;
