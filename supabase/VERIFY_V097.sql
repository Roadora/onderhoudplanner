-- Optero v0.9.7 verificatie. Alle waarden horen true te zijn.
select to_regclass('public.work_order_assignments') is not null as assignment_table_ok;
select to_regprocedure('public.set_appointment_assignments(uuid,text,uuid[])') is not null as assignment_rpc_ok;
select to_regprocedure('public.get_my_assigned_work(uuid,date,date)') is not null as technician_rpc_ok;
select exists(select 1 from pg_trigger where tgname='trg_protect_company_settings_from_planner' and not tgisinternal) as planner_settings_guard_ok;
select relrowsecurity from pg_class where oid='public.work_order_assignments'::regclass;
