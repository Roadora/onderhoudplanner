-- OnderhoudPlanner v0.8.2 — Cloudgegevens
-- Additieve migratie voor een bestaand v0.8.1-project.
-- Voer dit volledige bestand één keer uit in Supabase > SQL Editor.

begin;

create table if not exists public.company_settings (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  company_name text not null default 'Onderhoudsbedrijf',
  contact_name text not null default '',
  maintenance_price numeric(12,2) not null default 129 check (maintenance_price >= 0),
  lead_days integer not null default 45 check (lead_days between 1 and 365),
  default_interval integer not null default 12 check (default_interval between 1 and 120),
  whatsapp_template text not null default '',
  data_revision bigint not null default 0 check (data_revision >= 0),
  migrated_from_local_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  name text not null default '',
  address text not null default '',
  postal_code text not null default '',
  city text not null default '',
  phone text not null default '',
  email text not null default '',
  memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id)
);

create table if not exists public.installations (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  customer_id text not null,
  type text not null default 'airco' check (type in ('airco','warmtepomp')),
  brand text not null default '',
  model text not null default '',
  serial_number text not null default '',
  installed_at date,
  maintenance_interval integer not null default 12 check (maintenance_interval between 0 and 120),
  last_service_date date,
  service_status text not null default 'active' check (service_status in ('active','paused','declined')),
  paused_until date,
  status_note text not null default '',
  reminder_customer boolean not null default true,
  reminder_company boolean not null default true,
  done_count integer not null default 0 check (done_count >= 0),
  contact_status text not null default 'not_contacted'
    check (contact_status in ('not_contacted','contacted','responded','scheduled','completed')),
  last_contact_at date,
  maintenance_price numeric(12,2) check (maintenance_price is null or maintenance_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  constraint installations_customer_fk
    foreign key (organization_id, customer_id)
    references public.customers(organization_id, id)
    on delete cascade
);

create table if not exists public.appointments (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id text not null,
  customer_id text,
  installation_id text,
  type text not null default 'onderhoud',
  appointment_date date not null,
  appointment_time text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, id),
  constraint appointments_customer_fk
    foreign key (organization_id, customer_id)
    references public.customers(organization_id, id)
    on delete cascade,
  constraint appointments_installation_fk
    foreign key (organization_id, installation_id)
    references public.installations(organization_id, id)
    on delete cascade
);

create index if not exists customers_organization_name_idx
  on public.customers(organization_id, name);
create index if not exists installations_organization_customer_idx
  on public.installations(organization_id, customer_id);
create index if not exists installations_organization_installed_idx
  on public.installations(organization_id, installed_at);
create index if not exists appointments_organization_date_idx
  on public.appointments(organization_id, appointment_date, appointment_time);

alter table public.company_settings enable row level security;
alter table public.customers enable row level security;
alter table public.installations enable row level security;
alter table public.appointments enable row level security;

-- Leden van een bedrijfsomgeving mogen uitsluitend de rijen van dat bedrijf gebruiken.
drop policy if exists "company_settings_select_company" on public.company_settings;
drop policy if exists "company_settings_insert_company" on public.company_settings;
drop policy if exists "company_settings_update_company" on public.company_settings;
drop policy if exists "company_settings_delete_owner" on public.company_settings;
create policy "company_settings_select_company"
  on public.company_settings for select to authenticated
  using (public.is_organization_member(organization_id));
create policy "company_settings_insert_company"
  on public.company_settings for insert to authenticated
  with check (public.is_organization_member(organization_id));
create policy "company_settings_update_company"
  on public.company_settings for update to authenticated
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));
create policy "company_settings_delete_owner"
  on public.company_settings for delete to authenticated
  using (public.is_organization_owner(organization_id));

drop policy if exists "customers_select_company" on public.customers;
drop policy if exists "customers_insert_company" on public.customers;
drop policy if exists "customers_update_company" on public.customers;
drop policy if exists "customers_delete_company" on public.customers;
create policy "customers_select_company"
  on public.customers for select to authenticated
  using (public.is_organization_member(organization_id));
create policy "customers_insert_company"
  on public.customers for insert to authenticated
  with check (public.is_organization_member(organization_id));
create policy "customers_update_company"
  on public.customers for update to authenticated
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));
create policy "customers_delete_company"
  on public.customers for delete to authenticated
  using (public.is_organization_member(organization_id));

drop policy if exists "installations_select_company" on public.installations;
drop policy if exists "installations_insert_company" on public.installations;
drop policy if exists "installations_update_company" on public.installations;
drop policy if exists "installations_delete_company" on public.installations;
create policy "installations_select_company"
  on public.installations for select to authenticated
  using (public.is_organization_member(organization_id));
create policy "installations_insert_company"
  on public.installations for insert to authenticated
  with check (public.is_organization_member(organization_id));
create policy "installations_update_company"
  on public.installations for update to authenticated
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));
create policy "installations_delete_company"
  on public.installations for delete to authenticated
  using (public.is_organization_member(organization_id));

drop policy if exists "appointments_select_company" on public.appointments;
drop policy if exists "appointments_insert_company" on public.appointments;
drop policy if exists "appointments_update_company" on public.appointments;
drop policy if exists "appointments_delete_company" on public.appointments;
create policy "appointments_select_company"
  on public.appointments for select to authenticated
  using (public.is_organization_member(organization_id));
create policy "appointments_insert_company"
  on public.appointments for insert to authenticated
  with check (public.is_organization_member(organization_id));
create policy "appointments_update_company"
  on public.appointments for update to authenticated
  using (public.is_organization_member(organization_id))
  with check (public.is_organization_member(organization_id));
create policy "appointments_delete_company"
  on public.appointments for delete to authenticated
  using (public.is_organization_member(organization_id));

-- Eén atomische leesactie voorkomt een mix van oude en nieuwe rijen wanneer
-- een tweede apparaat precies tijdens het laden synchroniseert.
create or replace function public.get_organization_state(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not public.is_organization_member(p_organization_id) then
    raise exception 'Geen toegang tot deze bedrijfsomgeving.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'settings', (
      select to_jsonb(s)
      from public.company_settings s
      where s.organization_id = p_organization_id
    ),
    'customers', coalesce((
      select jsonb_agg(to_jsonb(c) order by c.name, c.id)
      from public.customers c
      where c.organization_id = p_organization_id
    ), '[]'::jsonb),
    'installations', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.created_at, i.id)
      from public.installations i
      where i.organization_id = p_organization_id
    ), '[]'::jsonb),
    'appointments', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.appointment_date, a.appointment_time, a.id)
      from public.appointments a
      where a.organization_id = p_organization_id
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

-- Atomische opslag van één complete bedrijfsstaat. Een revisie voorkomt dat een
-- oude browser stilletjes wijzigingen van een ander apparaat overschrijft.
create or replace function public.replace_organization_state(
  p_organization_id uuid,
  p_expected_revision bigint,
  p_state jsonb,
  p_migrated_from_local boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_revision bigint;
  v_now timestamptz := now();
begin
  if not public.is_organization_member(p_organization_id) then
    raise exception 'Geen toegang tot deze bedrijfsomgeving.' using errcode = '42501';
  end if;

  insert into public.company_settings (
    organization_id,
    company_name,
    contact_name,
    maintenance_price,
    lead_days,
    default_interval,
    whatsapp_template,
    data_revision,
    migrated_from_local_at,
    created_at,
    updated_at
  ) values (
    p_organization_id,
    coalesce(nullif(p_state #>> '{settings,company_name}', ''), 'Onderhoudsbedrijf'),
    coalesce(p_state #>> '{settings,contact_name}', ''),
    greatest(coalesce((p_state #>> '{settings,maintenance_price}')::numeric, 0), 0),
    greatest(1, least(coalesce((p_state #>> '{settings,lead_days}')::integer, 45), 365)),
    greatest(1, least(coalesce((p_state #>> '{settings,default_interval}')::integer, 12), 120)),
    coalesce(p_state #>> '{settings,whatsapp_template}', ''),
    0,
    case when p_migrated_from_local then v_now else null end,
    v_now,
    v_now
  )
  on conflict (organization_id) do nothing;

  select data_revision
    into v_revision
    from public.company_settings
   where organization_id = p_organization_id
   for update;

  if p_expected_revision is not null and p_expected_revision <> v_revision then
    raise exception 'CLOUD_REVISION_CONFLICT:%', v_revision using errcode = '40001';
  end if;

  update public.company_settings
     set company_name = coalesce(nullif(p_state #>> '{settings,company_name}', ''), company_name),
         contact_name = coalesce(p_state #>> '{settings,contact_name}', ''),
         maintenance_price = greatest(coalesce((p_state #>> '{settings,maintenance_price}')::numeric, maintenance_price), 0),
         lead_days = greatest(1, least(coalesce((p_state #>> '{settings,lead_days}')::integer, lead_days), 365)),
         default_interval = greatest(1, least(coalesce((p_state #>> '{settings,default_interval}')::integer, default_interval), 120)),
         whatsapp_template = coalesce(p_state #>> '{settings,whatsapp_template}', ''),
         migrated_from_local_at = case
           when p_migrated_from_local then coalesce(migrated_from_local_at, v_now)
           else migrated_from_local_at
         end,
         updated_at = v_now
   where organization_id = p_organization_id;

  insert into public.customers (
    organization_id, id, name, address, postal_code, city, phone, email, memo, created_at, updated_at
  )
  select
    p_organization_id,
    x.id,
    coalesce(x.name, ''),
    coalesce(x.address, ''),
    coalesce(x.postal_code, ''),
    coalesce(x.city, ''),
    coalesce(x.phone, ''),
    coalesce(x.email, ''),
    coalesce(x.memo, ''),
    v_now,
    v_now
  from jsonb_to_recordset(coalesce(p_state->'customers', '[]'::jsonb)) as x(
    id text, name text, address text, postal_code text, city text, phone text, email text, memo text
  )
  where nullif(x.id, '') is not null
  on conflict (organization_id, id) do update set
    name = excluded.name,
    address = excluded.address,
    postal_code = excluded.postal_code,
    city = excluded.city,
    phone = excluded.phone,
    email = excluded.email,
    memo = excluded.memo,
    updated_at = excluded.updated_at;

  insert into public.installations (
    organization_id, id, customer_id, type, brand, model, serial_number, installed_at,
    maintenance_interval, last_service_date, service_status, paused_until, status_note,
    reminder_customer, reminder_company, done_count, contact_status, last_contact_at,
    maintenance_price, created_at, updated_at
  )
  select
    p_organization_id,
    x.id,
    x.customer_id,
    case when x.type = 'warmtepomp' then 'warmtepomp' else 'airco' end,
    coalesce(x.brand, ''),
    coalesce(x.model, ''),
    coalesce(x.serial_number, ''),
    nullif(x.installed_at, '')::date,
    greatest(0, least(coalesce(x.maintenance_interval, 12), 120)),
    nullif(x.last_service_date, '')::date,
    case when x.service_status in ('active','paused','declined') then x.service_status else 'active' end,
    nullif(x.paused_until, '')::date,
    coalesce(x.status_note, ''),
    coalesce(x.reminder_customer, true),
    coalesce(x.reminder_company, true),
    greatest(coalesce(x.done_count, 0), 0),
    case when x.contact_status in ('not_contacted','contacted','responded','scheduled','completed')
      then x.contact_status else 'not_contacted' end,
    nullif(x.last_contact_at, '')::date,
    case when x.maintenance_price is null then null else greatest(x.maintenance_price, 0) end,
    v_now,
    v_now
  from jsonb_to_recordset(coalesce(p_state->'installations', '[]'::jsonb)) as x(
    id text,
    customer_id text,
    type text,
    brand text,
    model text,
    serial_number text,
    installed_at text,
    maintenance_interval integer,
    last_service_date text,
    service_status text,
    paused_until text,
    status_note text,
    reminder_customer boolean,
    reminder_company boolean,
    done_count integer,
    contact_status text,
    last_contact_at text,
    maintenance_price numeric
  )
  where nullif(x.id, '') is not null
    and exists (
      select 1 from public.customers c
       where c.organization_id = p_organization_id
         and c.id = x.customer_id
    )
  on conflict (organization_id, id) do update set
    customer_id = excluded.customer_id,
    type = excluded.type,
    brand = excluded.brand,
    model = excluded.model,
    serial_number = excluded.serial_number,
    installed_at = excluded.installed_at,
    maintenance_interval = excluded.maintenance_interval,
    last_service_date = excluded.last_service_date,
    service_status = excluded.service_status,
    paused_until = excluded.paused_until,
    status_note = excluded.status_note,
    reminder_customer = excluded.reminder_customer,
    reminder_company = excluded.reminder_company,
    done_count = excluded.done_count,
    contact_status = excluded.contact_status,
    last_contact_at = excluded.last_contact_at,
    maintenance_price = excluded.maintenance_price,
    updated_at = excluded.updated_at;

  insert into public.appointments (
    organization_id, id, customer_id, installation_id, type, appointment_date,
    appointment_time, note, created_at, updated_at
  )
  select
    p_organization_id,
    x.id,
    case when exists (
      select 1 from public.customers c
       where c.organization_id = p_organization_id and c.id = x.customer_id
    ) then x.customer_id else null end,
    case when exists (
      select 1 from public.installations i
       where i.organization_id = p_organization_id and i.id = x.installation_id
    ) then x.installation_id else null end,
    coalesce(nullif(x.type, ''), 'onderhoud'),
    nullif(x.appointment_date, '')::date,
    coalesce(x.appointment_time, ''),
    coalesce(x.note, ''),
    v_now,
    v_now
  from jsonb_to_recordset(coalesce(p_state->'appointments', '[]'::jsonb)) as x(
    id text,
    customer_id text,
    installation_id text,
    type text,
    appointment_date text,
    appointment_time text,
    note text
  )
  where nullif(x.id, '') is not null
    and nullif(x.appointment_date, '') is not null
  on conflict (organization_id, id) do update set
    customer_id = excluded.customer_id,
    installation_id = excluded.installation_id,
    type = excluded.type,
    appointment_date = excluded.appointment_date,
    appointment_time = excluded.appointment_time,
    note = excluded.note,
    updated_at = excluded.updated_at;

  delete from public.appointments a
   where a.organization_id = p_organization_id
     and not exists (
       select 1
       from jsonb_to_recordset(coalesce(p_state->'appointments', '[]'::jsonb)) as x(id text)
       where x.id = a.id
     );

  delete from public.installations i
   where i.organization_id = p_organization_id
     and not exists (
       select 1
       from jsonb_to_recordset(coalesce(p_state->'installations', '[]'::jsonb)) as x(id text)
       where x.id = i.id
     );

  delete from public.customers c
   where c.organization_id = p_organization_id
     and not exists (
       select 1
       from jsonb_to_recordset(coalesce(p_state->'customers', '[]'::jsonb)) as x(id text)
       where x.id = c.id
     );

  update public.company_settings
     set data_revision = data_revision + 1,
         updated_at = v_now
   where organization_id = p_organization_id
   returning data_revision into v_revision;

  return v_revision;
end;
$$;

revoke all on function public.get_organization_state(uuid) from public;
revoke all on function public.replace_organization_state(uuid, bigint, jsonb, boolean) from public;
grant execute on function public.get_organization_state(uuid) to authenticated;
grant execute on function public.replace_organization_state(uuid, bigint, jsonb, boolean) to authenticated;

-- De browser gebruikt uitsluitend de twee gecontroleerde RPC-functies. Rechtstreekse
-- tabeltoegang blijft dicht, ook wanneer iemand de publieke API-key inspecteert.
revoke all on public.company_settings from authenticated;
revoke all on public.customers from authenticated;
revoke all on public.installations from authenticated;
revoke all on public.appointments from authenticated;

commit;
