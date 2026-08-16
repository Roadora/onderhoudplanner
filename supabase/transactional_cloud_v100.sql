-- Optero v0.10.0 — Transactionele cloudopslag
-- Supabase is leidend; lokale snapshots mogen nooit stilzwijgend cloudrijen verwijderen.
-- Vereist v0.9.7. Voer dit bestand één keer volledig uit.

begin;

create or replace function public.merge_organization_state_v100(
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
  if not public.has_organization_role(p_organization_id, array['owner','planner']::text[]) then
    raise exception 'Geen toegang tot deze bedrijfsgegevens.' using errcode = '42501';
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


  update public.company_settings
     set data_revision = data_revision + 1,
         updated_at = v_now
   where organization_id = p_organization_id
   returning data_revision into v_revision;

  return v_revision;
end;
$$;


create or replace function public.delete_appointments_v100(
  p_organization_id uuid,
  p_expected_revision bigint,
  p_ids text[]
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_revision bigint;
begin
  if not public.has_organization_role(p_organization_id, array['owner','planner']::text[]) then
    raise exception 'Geen toegang tot deze bedrijfsgegevens.' using errcode = '42501';
  end if;
  select data_revision into v_revision from public.company_settings where organization_id=p_organization_id for update;
  if p_expected_revision is not null and p_expected_revision <> v_revision then
    raise exception 'CLOUD_REVISION_CONFLICT:%', v_revision using errcode = '40001';
  end if;
  delete from public.appointments where organization_id=p_organization_id and id = any(coalesce(p_ids,array[]::text[]));
  update public.company_settings set data_revision=data_revision+1,updated_at=now() where organization_id=p_organization_id returning data_revision into v_revision;
  return v_revision;
end;
$$;

create or replace function public.delete_installation_v100(
  p_organization_id uuid,
  p_expected_revision bigint,
  p_id text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_revision bigint;
begin
  if not public.has_organization_role(p_organization_id, array['owner','planner']::text[]) then raise exception 'Geen toegang tot deze bedrijfsgegevens.' using errcode='42501'; end if;
  select data_revision into v_revision from public.company_settings where organization_id=p_organization_id for update;
  if p_expected_revision is not null and p_expected_revision <> v_revision then raise exception 'CLOUD_REVISION_CONFLICT:%',v_revision using errcode='40001'; end if;
  delete from public.installations where organization_id=p_organization_id and id=p_id;
  update public.company_settings set data_revision=data_revision+1,updated_at=now() where organization_id=p_organization_id returning data_revision into v_revision;
  return v_revision;
end;
$$;

create or replace function public.delete_customer_v100(
  p_organization_id uuid,
  p_expected_revision bigint,
  p_id text
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_revision bigint;
begin
  if not public.has_organization_role(p_organization_id, array['owner','planner']::text[]) then raise exception 'Geen toegang tot deze bedrijfsgegevens.' using errcode='42501'; end if;
  select data_revision into v_revision from public.company_settings where organization_id=p_organization_id for update;
  if p_expected_revision is not null and p_expected_revision <> v_revision then raise exception 'CLOUD_REVISION_CONFLICT:%',v_revision using errcode='40001'; end if;
  delete from public.customers where organization_id=p_organization_id and id=p_id;
  update public.company_settings set data_revision=data_revision+1,updated_at=now() where organization_id=p_organization_id returning data_revision into v_revision;
  return v_revision;
end;
$$;

create or replace function public.clear_operational_data_v100(
  p_organization_id uuid,
  p_expected_revision bigint
)
returns bigint
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_revision bigint;
begin
  if not public.is_organization_owner(p_organization_id) then raise exception 'Alleen de eigenaar mag alle bedrijfsgegevens wissen.' using errcode='42501'; end if;
  select data_revision into v_revision from public.company_settings where organization_id=p_organization_id for update;
  if p_expected_revision is not null and p_expected_revision <> v_revision then raise exception 'CLOUD_REVISION_CONFLICT:%',v_revision using errcode='40001'; end if;
  delete from public.customers where organization_id=p_organization_id;
  update public.company_settings set data_revision=data_revision+1,updated_at=now() where organization_id=p_organization_id returning data_revision into v_revision;
  return v_revision;
end;
$$;

-- Schakel de oude destructieve snapshot-writer uit. Een achtergebleven oude PWA kan daardoor nooit
-- meer een nieuwere cloudstaat verwijderen.
revoke execute on function public.replace_organization_state(uuid,bigint,jsonb,boolean) from authenticated;

revoke all on function public.merge_organization_state_v100(uuid,bigint,jsonb,boolean) from public;
revoke all on function public.delete_appointments_v100(uuid,bigint,text[]) from public;
revoke all on function public.delete_installation_v100(uuid,bigint,text) from public;
revoke all on function public.delete_customer_v100(uuid,bigint,text) from public;
revoke all on function public.clear_operational_data_v100(uuid,bigint) from public;
grant execute on function public.merge_organization_state_v100(uuid,bigint,jsonb,boolean) to authenticated;
grant execute on function public.delete_appointments_v100(uuid,bigint,text[]) to authenticated;
grant execute on function public.delete_installation_v100(uuid,bigint,text) to authenticated;
grant execute on function public.delete_customer_v100(uuid,bigint,text) to authenticated;
grant execute on function public.clear_operational_data_v100(uuid,bigint) to authenticated;

commit;
