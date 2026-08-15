-- Optero v0.9.6 — Rollen, rechten en uitnodigingsmail-hardening
-- Vereist dat schema_accounts_v081.sql, cloud_schema_v082.sql, team_schema_v090.sql
-- en team_onboarding_v095.sql al zijn uitgevoerd.
-- Voer dit bestand één keer volledig uit in Supabase > SQL Editor.

begin;

-- Uitnodigingen krijgen een expliciete afleverstatus, zodat een mislukte mail
-- niet meer hetzelfde lijkt als een succesvol verzonden uitnodiging.
alter table public.team_invitations
  add column if not exists delivery_status text not null default 'pending'
    check (delivery_status in ('pending','sending','sent','mail_failed')),
  add column if not exists last_sent_at timestamptz,
  add column if not exists last_email_error text,
  add column if not exists email_attempts integer not null default 0
    check (email_attempts >= 0);

-- Actief lidmaatschap is voortaan een harde voorwaarde voor toegang.
create or replace function public.is_organization_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = auth.uid()
      and coalesce(member.status, 'active') = 'active'
  );
$$;

-- Centrale rolcontrole; voorkomt dat frontendkeuzes de databasebeveiliging bepalen.
create or replace function public.has_organization_role(
  p_organization_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.organization_id = p_organization_id
      and member.user_id = auth.uid()
      and coalesce(member.status, 'active') = 'active'
      and member.role = any(p_roles)
  );
$$;

revoke all on function public.is_organization_member(uuid) from public;
revoke all on function public.has_organization_role(uuid, text[]) from public;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.has_organization_role(uuid, text[]) to authenticated;

-- Een medewerker ziet alleen zijn eigen lidmaatschap. Eigenaar/planner mogen de
-- teamleden zien die nodig zijn voor planning. Alleen de eigenaar mag wijzigen.
drop policy if exists "members_select_company" on public.organization_members;
drop policy if exists "members_select_own_or_management" on public.organization_members;
create policy "members_select_own_or_management"
  on public.organization_members for select to authenticated
  using (
    user_id = auth.uid()
    or public.has_organization_role(organization_id, array['owner','planner']::text[])
  );

drop policy if exists "members_update_owner" on public.organization_members;
create policy "members_update_owner"
  on public.organization_members for update to authenticated
  using (public.is_organization_owner(organization_id))
  with check (public.is_organization_owner(organization_id));

-- Uitnodigingen en gebruikersbeheer zijn in v0.9.6 eigenaar-only.
drop policy if exists "team_invites_manage_owner_planner" on public.team_invitations;
drop policy if exists "team_invites_manage_owner" on public.team_invitations;
create policy "team_invites_manage_owner"
  on public.team_invitations for all to authenticated
  using (public.is_organization_owner(organization_id))
  with check (public.is_organization_owner(organization_id));

-- Bedrijfsinstellingen zijn alleen rechtstreeks toegankelijk voor de eigenaar.
drop policy if exists "company_settings_select_company" on public.company_settings;
drop policy if exists "company_settings_insert_company" on public.company_settings;
drop policy if exists "company_settings_update_company" on public.company_settings;
drop policy if exists "company_settings_delete_owner" on public.company_settings;
drop policy if exists "company_settings_owner_select" on public.company_settings;
drop policy if exists "company_settings_owner_insert" on public.company_settings;
drop policy if exists "company_settings_owner_update" on public.company_settings;
drop policy if exists "company_settings_owner_delete" on public.company_settings;
create policy "company_settings_owner_select"
  on public.company_settings for select to authenticated
  using (public.is_organization_owner(organization_id));
create policy "company_settings_owner_insert"
  on public.company_settings for insert to authenticated
  with check (public.is_organization_owner(organization_id));
create policy "company_settings_owner_update"
  on public.company_settings for update to authenticated
  using (public.is_organization_owner(organization_id))
  with check (public.is_organization_owner(organization_id));
create policy "company_settings_owner_delete"
  on public.company_settings for delete to authenticated
  using (public.is_organization_owner(organization_id));

-- Operationele data: eigenaar en planner. Monteurs krijgen in de volgende
-- opdrachtversie uitsluitend de rijen die daadwerkelijk aan hen zijn toegewezen.
-- Tot die toewijzingskolommen bestaan, is volledige bedrijfsdata voor monteurs dicht.
do $$
declare
  t text;
begin
  foreach t in array array['customers','installations','appointments'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_company', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert_company', t);
    execute format('drop policy if exists %I on public.%I', t || '_update_company', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete_company', t);
    execute format('drop policy if exists %I on public.%I', t || '_management_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_management_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_management_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_management_delete', t);

    execute format(
      'create policy %I on public.%I for select to authenticated using (public.has_organization_role(organization_id, array[''owner'',''planner'']::text[]))',
      t || '_management_select', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.has_organization_role(organization_id, array[''owner'',''planner'']::text[]))',
      t || '_management_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.has_organization_role(organization_id, array[''owner'',''planner'']::text[])) with check (public.has_organization_role(organization_id, array[''owner'',''planner'']::text[]))',
      t || '_management_update', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.has_organization_role(organization_id, array[''owner'',''planner'']::text[]))',
      t || '_management_delete', t
    );
  end loop;
end $$;

-- De cloud-RPC's zijn SECURITY DEFINER en moeten daarom zélf op rol controleren.
create or replace function public.get_organization_state(p_organization_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
begin
  if not public.has_organization_role(p_organization_id, array['owner','planner']::text[]) then
    raise exception 'Geen toegang tot deze bedrijfsgegevens.' using errcode = '42501';
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

-- De atomische opslag-RPC krijgt dezelfde server-side rolcontrole.
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

-- Extra hulpfunctie voor toekomstige serverfuncties.
create or replace function public.assert_can_manage_organization(p_organization_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_organization_role(p_organization_id, array['owner','planner']::text[]) then
    raise exception 'Geen toegang tot deze bedrijfsgegevens.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.assert_can_manage_organization(uuid) from public;
grant execute on function public.assert_can_manage_organization(uuid) to authenticated;

-- list_team_members blijft beschikbaar voor eigenaar/planner (nodig voor planbord),
-- maar niet voor monteurs.
create or replace function public.list_team_members(p_organization_id uuid)
returns table(user_id uuid,email text,display_name text,role text,status text,created_at timestamptz)
language sql
security definer
set search_path = public, auth, pg_temp
as $$
  select m.user_id,u.email,coalesce(nullif(m.display_name,''),p.full_name,''),m.role,m.status,m.created_at
  from public.organization_members m
  join auth.users u on u.id=m.user_id
  left join public.profiles p on p.id=m.user_id
  where m.organization_id=p_organization_id
    and public.has_organization_role(p_organization_id, array['owner','planner']::text[])
  order by case m.role when 'owner' then 0 when 'planner' then 1 else 2 end, coalesce(m.display_name,u.email);
$$;

revoke all on function public.list_team_members(uuid) from public;
grant execute on function public.list_team_members(uuid) to authenticated;

-- Bestaande API-grants blijven beperkt tot authenticated; RLS bepaalt de rijen.
grant select, insert, update, delete on table public.team_invitations to authenticated;

commit;
