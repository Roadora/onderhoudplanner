-- Optero v0.9.7 — Werktoewijzing & data-isolatie
-- Vereist v0.9.6 (roles_mail_hardening_v096.sql).
-- Voer dit bestand één keer volledig uit in Supabase > SQL Editor.

begin;

-- Eén opdracht kan aan meerdere actieve teamleden worden toegewezen.
create table if not exists public.work_order_assignments (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  appointment_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  work_status text not null default 'assigned'
    check (work_status in ('assigned','on_the_way','started','completed','cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, appointment_id, user_id),
  constraint work_assignments_appointment_fk
    foreign key (organization_id, appointment_id)
    references public.appointments(organization_id, id)
    on delete cascade,
  constraint work_assignments_member_fk
    foreign key (organization_id, user_id)
    references public.organization_members(organization_id, user_id)
    on delete cascade
);

create index if not exists work_assignments_user_idx
  on public.work_order_assignments(organization_id, user_id, appointment_id);

alter table public.work_order_assignments enable row level security;

drop policy if exists "work_assignments_management_all" on public.work_order_assignments;
drop policy if exists "work_assignments_technician_select_own" on public.work_order_assignments;
create policy "work_assignments_management_all"
  on public.work_order_assignments for all to authenticated
  using (public.has_organization_role(organization_id, array['owner','planner']::text[]))
  with check (public.has_organization_role(organization_id, array['owner','planner']::text[]));
create policy "work_assignments_technician_select_own"
  on public.work_order_assignments for select to authenticated
  using (
    user_id = auth.uid()
    and public.is_organization_member(organization_id)
  );

grant select, insert, update, delete on public.work_order_assignments to authenticated;

-- Planner/eigenaar kan de medewerkers op één afspraak atomisch vervangen.
create or replace function public.set_appointment_assignments(
  p_organization_id uuid,
  p_appointment_id text,
  p_user_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_count integer := 0;
begin
  if not public.has_organization_role(p_organization_id, array['owner','planner']::text[]) then
    raise exception 'Geen rechten om werk toe te wijzen.' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.appointments a
    where a.organization_id = p_organization_id
      and a.id = p_appointment_id
  ) then
    raise exception 'De afspraak bestaat niet.' using errcode = 'P0002';
  end if;

  delete from public.work_order_assignments
   where organization_id = p_organization_id
     and appointment_id = p_appointment_id;

  insert into public.work_order_assignments(organization_id, appointment_id, user_id)
  select p_organization_id, p_appointment_id, member.user_id
  from public.organization_members member
  where member.organization_id = p_organization_id
    and member.user_id = any(coalesce(p_user_ids, array[]::uuid[]))
    and coalesce(member.status,'active') = 'active'
    and member.role in ('owner','planner','technician')
  on conflict do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.set_appointment_assignments(uuid,text,uuid[]) from public;
grant execute on function public.set_appointment_assignments(uuid,text,uuid[]) to authenticated;

-- Monteurs halen uitsluitend hun eigen toegewezen werkzaamheden op. De RPC geeft
-- alleen de klanten/installaties terug die bij die opdrachten horen.
create or replace function public.get_my_assigned_work(
  p_organization_id uuid,
  p_from date,
  p_until date
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not public.is_organization_member(p_organization_id) then
    raise exception 'Geen toegang tot deze werkomgeving.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'appointments', coalesce((
      select jsonb_agg(to_jsonb(a) || jsonb_build_object(
        'work_status', wa.work_status,
        'started_at', wa.started_at,
        'completed_at', wa.completed_at
      ) order by a.appointment_date, a.appointment_time, a.id)
      from public.work_order_assignments wa
      join public.appointments a
        on a.organization_id = wa.organization_id
       and a.id = wa.appointment_id
      where wa.organization_id = p_organization_id
        and wa.user_id = auth.uid()
        and a.appointment_date between p_from and p_until
        and wa.work_status <> 'cancelled'
    ), '[]'::jsonb),
    'customers', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.name, c.id)
      from public.customers c
      where c.organization_id = p_organization_id
        and exists (
          select 1
          from public.work_order_assignments wa
          join public.appointments a
            on a.organization_id = wa.organization_id
           and a.id = wa.appointment_id
          where wa.organization_id = p_organization_id
            and wa.user_id = auth.uid()
            and a.appointment_date between p_from and p_until
            and wa.work_status <> 'cancelled'
            and a.customer_id = c.id
        )
    ), '[]'::jsonb),
    'installations', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.created_at, i.id)
      from public.installations i
      where i.organization_id = p_organization_id
        and exists (
          select 1
          from public.work_order_assignments wa
          join public.appointments a
            on a.organization_id = wa.organization_id
           and a.id = wa.appointment_id
          where wa.organization_id = p_organization_id
            and wa.user_id = auth.uid()
            and a.appointment_date between p_from and p_until
            and wa.work_status <> 'cancelled'
            and a.installation_id = i.id
        )
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;
revoke all on function public.get_my_assigned_work(uuid,date,date) from public;
grant execute on function public.get_my_assigned_work(uuid,date,date) to authenticated;

-- Defense in depth: replace_organization_state mag door planners worden gebruikt
-- voor operationele data, maar het triggerfilter voorkomt dat die RPC tegelijk
-- bedrijfsinstellingen wijzigt. Revisievelden blijven wel bruikbaar voor sync.
create or replace function public.protect_company_settings_from_planner()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null
     and public.has_organization_role(old.organization_id, array['planner']::text[])
     and not public.is_organization_owner(old.organization_id) then
    new.company_name := old.company_name;
    new.contact_name := old.contact_name;
    new.maintenance_price := old.maintenance_price;
    new.lead_days := old.lead_days;
    new.default_interval := old.default_interval;
    new.whatsapp_template := old.whatsapp_template;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_company_settings_from_planner on public.company_settings;
create trigger trg_protect_company_settings_from_planner
before update on public.company_settings
for each row execute function public.protect_company_settings_from_planner();

commit;
