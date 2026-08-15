-- Optero v0.9.6 controle (veilig: alleen lezen)
select
  to_regprocedure('public.has_organization_role(uuid,text[])') is not null as role_helper_ok,
  exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='team_invitations' and column_name='delivery_status'
  ) as invite_delivery_status_ok,
  exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='team_invitations' and policyname='team_invites_manage_owner'
  ) as invite_owner_policy_ok,
  exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='customers' and policyname='customers_management_select'
  ) as customers_management_policy_ok,
  exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='organization_members' and policyname='members_select_own_or_management'
  ) as member_visibility_policy_ok;
