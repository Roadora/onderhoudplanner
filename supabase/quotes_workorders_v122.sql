-- Optero v0.12.2 — Offerte → werkorder → uitvoering
-- Vereist o.a. roles_mail_hardening_v096.sql, work_assignment_isolation_v097.sql en surveys_v112.sql.
-- Voer dit bestand één keer volledig uit in Supabase > SQL Editor.

begin;

create table if not exists public.quotes (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  survey_appointment_id text not null,
  customer_id text not null,
  status text not null default 'draft' check (status in ('draft','sent','accepted','rejected')),
  items jsonb not null default '[]'::jsonb,
  notes text not null default '',
  total_amount numeric(12,2) not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,id),
  unique (organization_id,survey_appointment_id),
  constraint quotes_survey_fk foreign key (organization_id,survey_appointment_id)
    references public.appointments(organization_id,id) on delete cascade,
  constraint quotes_customer_fk foreign key (organization_id,customer_id)
    references public.customers(organization_id,id) on delete cascade
);

create table if not exists public.work_orders (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  id uuid not null default gen_random_uuid(),
  quote_id uuid,
  survey_appointment_id text,
  customer_id text not null,
  installation_id text,
  appointment_id text,
  title text not null default 'Werkorder',
  status text not null default 'concept' check (status in ('concept','ready','scheduled','in_progress','completed','cancelled')),
  details jsonb not null default '{}'::jsonb,
  execution jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id,id),
  unique (organization_id,quote_id),
  unique (organization_id,appointment_id),
  constraint work_orders_quote_fk foreign key (organization_id,quote_id)
    references public.quotes(organization_id,id) on delete set null,
  constraint work_orders_survey_fk foreign key (organization_id,survey_appointment_id)
    references public.appointments(organization_id,id) on delete set null,
  constraint work_orders_customer_fk foreign key (organization_id,customer_id)
    references public.customers(organization_id,id) on delete cascade,
  constraint work_orders_installation_fk foreign key (organization_id,installation_id)
    references public.installations(organization_id,id) on delete set null,
  constraint work_orders_appointment_fk foreign key (organization_id,appointment_id)
    references public.appointments(organization_id,id) on delete set null
);

create index if not exists quotes_status_idx on public.quotes(organization_id,status,updated_at desc);
create index if not exists work_orders_status_idx on public.work_orders(organization_id,status,updated_at desc);
create index if not exists work_orders_appointment_idx on public.work_orders(organization_id,appointment_id);

alter table public.quotes enable row level security;
alter table public.work_orders enable row level security;

-- Geen directe tabeltoegang vanuit de app; alle toegang loopt via afgeschermde RPC's.
revoke all on public.quotes from anon, authenticated;
revoke all on public.work_orders from anon, authenticated;

create or replace function public.work_order_is_assigned_to_me_v122(p_organization_id uuid,p_appointment_id text)
returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $$
  select exists(
    select 1 from public.work_order_assignments wa
    where wa.organization_id=p_organization_id
      and wa.appointment_id=p_appointment_id
      and wa.user_id=auth.uid()
      and wa.work_status<>'cancelled'
  );
$$;

create or replace function public.list_work_orders_v122(p_organization_id uuid)
returns table(id uuid,quote_id uuid,survey_appointment_id text,customer_id text,installation_id text,appointment_id text,title text,status text,details jsonb,execution jsonb,updated_at timestamptz)
language sql stable security definer set search_path=public,auth,pg_temp as $$
  select w.id,w.quote_id,w.survey_appointment_id,w.customer_id,w.installation_id,w.appointment_id,w.title,w.status,
         coalesce(w.details,'{}'::jsonb),coalesce(w.execution,'{}'::jsonb),w.updated_at
  from public.work_orders w
  where w.organization_id=p_organization_id
    and (
      public.has_organization_role(p_organization_id,array['owner','planner']::text[])
      or (w.appointment_id is not null and public.work_order_is_assigned_to_me_v122(p_organization_id,w.appointment_id))
    )
  order by case w.status when 'ready' then 0 when 'scheduled' then 1 when 'in_progress' then 2 when 'concept' then 3 else 4 end,w.updated_at desc;
$$;

create or replace function public.get_work_order_v122(p_organization_id uuid,p_work_order_id uuid)
returns table(id uuid,quote_id uuid,survey_appointment_id text,customer_id text,installation_id text,appointment_id text,title text,status text,details jsonb,execution jsonb,updated_at timestamptz)
language sql stable security definer set search_path=public,auth,pg_temp as $$
  select w.id,w.quote_id,w.survey_appointment_id,w.customer_id,w.installation_id,w.appointment_id,w.title,w.status,
         coalesce(w.details,'{}'::jsonb),coalesce(w.execution,'{}'::jsonb),w.updated_at
  from public.work_orders w
  where w.organization_id=p_organization_id and w.id=p_work_order_id
    and (
      public.has_organization_role(p_organization_id,array['owner','planner']::text[])
      or (w.appointment_id is not null and public.work_order_is_assigned_to_me_v122(p_organization_id,w.appointment_id))
    );
$$;

create or replace function public.get_work_order_by_appointment_v122(p_organization_id uuid,p_appointment_id text)
returns table(id uuid,quote_id uuid,survey_appointment_id text,customer_id text,installation_id text,appointment_id text,title text,status text,details jsonb,execution jsonb,updated_at timestamptz)
language sql stable security definer set search_path=public,auth,pg_temp as $$
  select * from public.get_work_order_v122(p_organization_id,(
    select w.id from public.work_orders w where w.organization_id=p_organization_id and w.appointment_id=p_appointment_id limit 1
  ));
$$;

create or replace function public.get_work_order_by_quote_v122(p_organization_id uuid,p_quote_id uuid)
returns table(id uuid,quote_id uuid,survey_appointment_id text,customer_id text,installation_id text,appointment_id text,title text,status text,details jsonb,execution jsonb,updated_at timestamptz)
language sql stable security definer set search_path=public,auth,pg_temp as $$
  select * from public.get_work_order_v122(p_organization_id,(
    select w.id from public.work_orders w where w.organization_id=p_organization_id and w.quote_id=p_quote_id limit 1
  ));
$$;

create or replace function public.upsert_work_order_v122(
  p_organization_id uuid,p_work_order_id uuid,p_quote_id uuid,p_survey_appointment_id text,p_customer_id text,p_installation_id text,p_title text,p_status text,p_details jsonb
)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_id uuid;
begin
  if not public.has_organization_role(p_organization_id,array['owner','planner']::text[]) then
    raise exception 'Geen rechten om werkorders te wijzigen.' using errcode='42501';
  end if;
  if coalesce(p_status,'') not in ('concept','ready','scheduled','in_progress','completed','cancelled') then raise exception 'Ongeldige werkorderstatus'; end if;
  if p_work_order_id is null then
    insert into public.work_orders(organization_id,quote_id,survey_appointment_id,customer_id,installation_id,title,status,details,created_by,updated_by)
    values(p_organization_id,p_quote_id,p_survey_appointment_id,p_customer_id,nullif(p_installation_id,''),coalesce(nullif(p_title,''),'Werkorder'),p_status,coalesce(p_details,'{}'::jsonb),auth.uid(),auth.uid())
    returning id into v_id;
  else
    update public.work_orders set
      quote_id=coalesce(p_quote_id,quote_id),survey_appointment_id=coalesce(p_survey_appointment_id,survey_appointment_id),customer_id=coalesce(p_customer_id,customer_id),
      installation_id=nullif(p_installation_id,''),title=coalesce(nullif(p_title,''),title),status=p_status,details=coalesce(p_details,'{}'::jsonb),updated_by=auth.uid(),updated_at=now()
    where organization_id=p_organization_id and id=p_work_order_id returning id into v_id;
  end if;
  if v_id is null then raise exception 'Werkorder niet gevonden.' using errcode='P0002'; end if;
  return v_id;
end $$;

create or replace function public.link_work_order_appointment_v122(p_organization_id uuid,p_work_order_id uuid,p_appointment_id text)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
  if not public.has_organization_role(p_organization_id,array['owner','planner']::text[]) then raise exception 'Geen rechten om werkorders in te plannen.' using errcode='42501'; end if;
  if not exists(select 1 from public.appointments a where a.organization_id=p_organization_id and a.id=p_appointment_id) then raise exception 'Afspraak niet gevonden.'; end if;
  update public.work_orders set appointment_id=p_appointment_id,status='scheduled',updated_by=auth.uid(),updated_at=now()
  where organization_id=p_organization_id and id=p_work_order_id and status in ('ready','scheduled');
  if not found then raise exception 'Werkorder is nog niet klaar om in te plannen.'; end if;
  return p_work_order_id;
end $$;

create or replace function public.update_work_order_execution_v122(p_organization_id uuid,p_work_order_id uuid,p_execution jsonb,p_status text)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare
  v_appointment_id text;
  v_extra_work jsonb;
  v_safe_execution jsonb;
begin
  select appointment_id into v_appointment_id from public.work_orders where organization_id=p_organization_id and id=p_work_order_id;
  if v_appointment_id is null then raise exception 'Werkorder is nog niet ingepland.'; end if;
  if not (
    public.has_organization_role(p_organization_id,array['owner','planner']::text[])
    or public.work_order_is_assigned_to_me_v122(p_organization_id,v_appointment_id)
  ) then raise exception 'Geen toegang tot deze werkorder.' using errcode='42501'; end if;
  if coalesce(p_status,'') not in ('scheduled','in_progress','completed') then raise exception 'Ongeldige uitvoeringsstatus'; end if;

  -- Whitelist uitsluitend technische uitvoeringsvelden. Kosten, prijzen, marges
  -- en andere commerciële velden kunnen hierdoor ook niet via een handmatige
  -- RPC-call in het monteursdeel van een werkorder terechtkomen.
  select coalesce(jsonb_agg(jsonb_build_object(
    'description',coalesce(x->>'description',''),
    'quantity',coalesce(x->>'quantity',''),
    'note',coalesce(x->>'note','')
  )),'[]'::jsonb)
  into v_extra_work
  from jsonb_array_elements(case when jsonb_typeof(coalesce(p_execution->'extraWork','[]'::jsonb))='array' then coalesce(p_execution->'extraWork','[]'::jsonb) else '[]'::jsonb end) x;

  v_safe_execution=jsonb_build_object(
    'actualLineLengthM',coalesce(p_execution->>'actualLineLengthM',''),
    'extraLineM',coalesce(p_execution->>'extraLineM',''),
    'refrigerantType',coalesce(p_execution->>'refrigerantType','unknown'),
    'extraRefrigerantG',coalesce(p_execution->>'extraRefrigerantG',''),
    'extraWork',v_extra_work,
    'notes',coalesce(p_execution->>'notes','')
  );

  update public.work_orders set execution=v_safe_execution,status=p_status,updated_by=auth.uid(),updated_at=now()
  where organization_id=p_organization_id and id=p_work_order_id;
  return p_work_order_id;
end $$;

create or replace function public.get_quote_by_survey_v122(p_organization_id uuid,p_survey_appointment_id text)
returns table(id uuid,survey_appointment_id text,customer_id text,status text,items jsonb,notes text,total_amount numeric,updated_at timestamptz)
language sql stable security definer set search_path=public,auth,pg_temp as $$
  select q.id,q.survey_appointment_id,q.customer_id,q.status,q.items,q.notes,q.total_amount,q.updated_at
  from public.quotes q where q.organization_id=p_organization_id and q.survey_appointment_id=p_survey_appointment_id
    and public.is_organization_owner(p_organization_id);
$$;

create or replace function public.get_quote_v122(p_organization_id uuid,p_quote_id uuid)
returns table(id uuid,survey_appointment_id text,customer_id text,status text,items jsonb,notes text,total_amount numeric,updated_at timestamptz)
language sql stable security definer set search_path=public,auth,pg_temp as $$
  select q.id,q.survey_appointment_id,q.customer_id,q.status,q.items,q.notes,q.total_amount,q.updated_at
  from public.quotes q where q.organization_id=p_organization_id and q.id=p_quote_id and public.is_organization_owner(p_organization_id);
$$;

create or replace function public.upsert_quote_v122(
  p_organization_id uuid,p_quote_id uuid,p_survey_appointment_id text,p_customer_id text,p_status text,p_items jsonb,p_notes text
)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_id uuid; v_total numeric(12,2); v_customer_name text;
begin
  if not public.is_organization_owner(p_organization_id) then raise exception 'Alleen de eigenaar heeft toegang tot offertes en bedragen.' using errcode='42501'; end if;
  if coalesce(p_status,'') not in ('draft','sent','accepted','rejected') then raise exception 'Ongeldige offertestatus'; end if;
  if not exists(select 1 from public.appointments a where a.organization_id=p_organization_id and a.id=p_survey_appointment_id and a.type='opname') then raise exception 'Opnameafspraak niet gevonden.'; end if;
  select coalesce(sum(greatest(0,coalesce((x->>'quantity')::numeric,0))*greatest(0,coalesce((x->>'unitPrice')::numeric,0))),0)
    into v_total from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x;
  if p_quote_id is null then
    insert into public.quotes(organization_id,survey_appointment_id,customer_id,status,items,notes,total_amount,created_by,updated_by)
    values(p_organization_id,p_survey_appointment_id,p_customer_id,p_status,coalesce(p_items,'[]'::jsonb),coalesce(p_notes,''),v_total,auth.uid(),auth.uid())
    on conflict(organization_id,survey_appointment_id) do update set status=excluded.status,items=excluded.items,notes=excluded.notes,total_amount=excluded.total_amount,updated_by=auth.uid(),updated_at=now()
    returning id into v_id;
  else
    update public.quotes set status=p_status,items=coalesce(p_items,'[]'::jsonb),notes=coalesce(p_notes,''),total_amount=v_total,updated_by=auth.uid(),updated_at=now()
    where organization_id=p_organization_id and id=p_quote_id returning id into v_id;
  end if;
  if v_id is null then raise exception 'Offerte niet gevonden.'; end if;

  select name into v_customer_name from public.customers where organization_id=p_organization_id and id=p_customer_id;
  insert into public.work_orders(organization_id,quote_id,survey_appointment_id,customer_id,title,status,details,created_by,updated_by)
  values(p_organization_id,v_id,p_survey_appointment_id,p_customer_id,'Werkorder '||coalesce(v_customer_name,'klant'),case when p_status='accepted' then 'ready' else 'concept' end,'{}'::jsonb,auth.uid(),auth.uid())
  on conflict(organization_id,quote_id) do update set
    status=case when public.work_orders.status in ('scheduled','in_progress','completed') then public.work_orders.status when p_status='accepted' then 'ready' else 'concept' end,
    updated_by=auth.uid(),updated_at=now();
  return v_id;
end $$;

revoke all on function public.work_order_is_assigned_to_me_v122(uuid,text),public.list_work_orders_v122(uuid),public.get_work_order_v122(uuid,uuid),public.get_work_order_by_appointment_v122(uuid,text),public.get_work_order_by_quote_v122(uuid,uuid),public.upsert_work_order_v122(uuid,uuid,uuid,text,text,text,text,text,jsonb),public.link_work_order_appointment_v122(uuid,uuid,text),public.update_work_order_execution_v122(uuid,uuid,jsonb,text),public.get_quote_by_survey_v122(uuid,text),public.get_quote_v122(uuid,uuid),public.upsert_quote_v122(uuid,uuid,text,text,text,jsonb,text) from public;
grant execute on function public.work_order_is_assigned_to_me_v122(uuid,text),public.list_work_orders_v122(uuid),public.get_work_order_v122(uuid,uuid),public.get_work_order_by_appointment_v122(uuid,text),public.get_work_order_by_quote_v122(uuid,uuid),public.upsert_work_order_v122(uuid,uuid,uuid,text,text,text,text,text,jsonb),public.link_work_order_appointment_v122(uuid,uuid,text),public.update_work_order_execution_v122(uuid,uuid,jsonb,text),public.get_quote_by_survey_v122(uuid,text),public.get_quote_v122(uuid,uuid),public.upsert_quote_v122(uuid,uuid,text,text,text,jsonb,text) to authenticated;

commit;
