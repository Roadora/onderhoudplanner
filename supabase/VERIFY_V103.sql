select
  to_regprocedure('public.verify_appointment_persisted_v103(uuid,text)') is not null as verification_rpc_ok,
  has_function_privilege('authenticated', 'public.verify_appointment_persisted_v103(uuid,text)', 'EXECUTE') as authenticated_can_execute_ok,
  not has_table_privilege('authenticated', 'public.appointments', 'SELECT') as direct_select_stays_closed_ok,
  not has_table_privilege('authenticated', 'public.appointments', 'INSERT') as direct_insert_stays_closed_ok,
  not has_table_privilege('authenticated', 'public.appointments', 'UPDATE') as direct_update_stays_closed_ok;
