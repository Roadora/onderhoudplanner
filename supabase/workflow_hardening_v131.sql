-- Optero v0.13.1 — Workflow audit hardening
-- Vereist: surveys_v111/v112.sql en quotes_workorders_v122.sql.
-- Voer dit bestand één keer volledig uit in Supabase > SQL Editor.

begin;

-- Een monteur die aan de UITVOERINGSafspraak van een werkorder is toegewezen
-- moet ook de opname en opnamefoto's kunnen lezen die aan die werkorder hangen.
create or replace function public.can_access_survey_v110(p_organization_id uuid,p_appointment_id text)
returns boolean language sql stable security definer set search_path=public,auth,pg_temp as $$
  select public.has_organization_role(p_organization_id,array['owner','planner']::text[])
  or exists(
    select 1 from public.work_order_assignments wa
    where wa.organization_id=p_organization_id
      and wa.appointment_id=p_appointment_id
      and wa.user_id=auth.uid()
      and wa.work_status<>'cancelled'
  )
  or exists(
    select 1
    from public.work_orders wo
    join public.work_order_assignments wa
      on wa.organization_id=wo.organization_id
     and wa.appointment_id=wo.appointment_id
    where wo.organization_id=p_organization_id
      and wo.survey_appointment_id=p_appointment_id
      and wo.appointment_id is not null
      and wa.user_id=auth.uid()
      and wa.work_status<>'cancelled'
  );
$$;

-- Werkorder-details zijn uitsluitend technisch. Deze whitelist voorkomt dat
-- prijzen, kostprijzen, marges of andere commerciële JSON-velden ooit via
-- work_orders.details in het monteursportaal terecht kunnen komen.
create or replace function public.safe_work_order_details_v131(p_details jsonb)
returns jsonb language plpgsql immutable set search_path=public,pg_temp as $$
declare
  v_input jsonb := coalesce(p_details,'{}'::jsonb);
  v_systems jsonb := '[]'::jsonb;
begin
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'systemType',coalesce(s->>'systemType',''),
      'unitCount',case when coalesce(s->>'unitCount','') ~ '^[0-9]+$' then (s->>'unitCount')::int else 1 end,
      'brand',coalesce(s->>'brand',''),
      'model',coalesce(s->>'model',''),
      'expectedLineLengthM',coalesce(s->>'expectedLineLengthM',''),
      'refrigerantType',coalesce(s->>'refrigerantType','unknown'),
      'factoryChargeKg',coalesce(s->>'factoryChargeKg',''),
      'includedLineM',coalesce(s->>'includedLineM',''),
      'extraRefrigerantPerM',coalesce(s->>'extraRefrigerantPerM',''),
      'units',(
        select coalesce(jsonb_agg(jsonb_build_object(
          'room',coalesce(u->>'room',''),
          'capacityKw',coalesce(u->>'capacityKw','')
        )),'[]'::jsonb)
        from jsonb_array_elements(
          case when jsonb_typeof(coalesce(s->'units','[]'::jsonb))='array'
            then coalesce(s->'units','[]'::jsonb) else '[]'::jsonb end
        ) u
      )
    )
  ),'[]'::jsonb)
  into v_systems
  from jsonb_array_elements(
    case when jsonb_typeof(coalesce(v_input->'systems','[]'::jsonb))='array'
      then coalesce(v_input->'systems','[]'::jsonb) else '[]'::jsonb end
  ) s;

  return jsonb_build_object(
    'jobType',coalesce(v_input->>'jobType',''),
    'workType',coalesce(v_input->>'workType',''),
    'systemDescription',coalesce(v_input->>'systemDescription',''),
    'brand',coalesce(v_input->>'brand',''),
    'model',coalesce(v_input->>'model',''),
    'expectedLineLengthM',coalesce(v_input->>'expectedLineLengthM',''),
    'refrigerantType',coalesce(v_input->>'refrigerantType',''),
    'factoryChargeKg',coalesce(v_input->>'factoryChargeKg',''),
    'includedLineM',coalesce(v_input->>'includedLineM',''),
    'extraRefrigerantPerM',coalesce(v_input->>'extraRefrigerantPerM',''),
    'materials',coalesce(v_input->>'materials',''),
    'instructions',coalesce(v_input->>'instructions',''),
    'notes',coalesce(v_input->>'notes',''),
    'systems',v_systems
  );
end $$;

create or replace function public.list_work_orders_v122(p_organization_id uuid)
returns table(id uuid,quote_id uuid,survey_appointment_id text,customer_id text,installation_id text,appointment_id text,title text,status text,details jsonb,execution jsonb,updated_at timestamptz)
language sql stable security definer set search_path=public,auth,pg_temp as $$
  select w.id,w.quote_id,w.survey_appointment_id,w.customer_id,w.installation_id,w.appointment_id,w.title,w.status,
         public.safe_work_order_details_v131(w.details),coalesce(w.execution,'{}'::jsonb),w.updated_at
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
         public.safe_work_order_details_v131(w.details),coalesce(w.execution,'{}'::jsonb),w.updated_at
  from public.work_orders w
  where w.organization_id=p_organization_id and w.id=p_work_order_id
    and (
      public.has_organization_role(p_organization_id,array['owner','planner']::text[])
      or (w.appointment_id is not null and public.work_order_is_assigned_to_me_v122(p_organization_id,w.appointment_id))
    );
$$;

create or replace function public.upsert_work_order_v122(
  p_organization_id uuid,p_work_order_id uuid,p_quote_id uuid,p_survey_appointment_id text,p_customer_id text,p_installation_id text,p_title text,p_status text,p_details jsonb
)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_id uuid; v_safe_details jsonb;
begin
  if not public.has_organization_role(p_organization_id,array['owner','planner']::text[]) then
    raise exception 'Geen rechten om werkorders te wijzigen.' using errcode='42501';
  end if;
  if coalesce(p_status,'') not in ('concept','ready','scheduled','in_progress','completed','cancelled') then raise exception 'Ongeldige werkorderstatus'; end if;
  v_safe_details:=public.safe_work_order_details_v131(p_details);
  if p_work_order_id is null then
    insert into public.work_orders(organization_id,quote_id,survey_appointment_id,customer_id,installation_id,title,status,details,created_by,updated_by)
    values(p_organization_id,p_quote_id,p_survey_appointment_id,p_customer_id,nullif(p_installation_id,''),coalesce(nullif(p_title,''),'Werkorder'),p_status,v_safe_details,auth.uid(),auth.uid())
    returning id into v_id;
  else
    update public.work_orders set
      quote_id=coalesce(p_quote_id,quote_id),survey_appointment_id=coalesce(p_survey_appointment_id,survey_appointment_id),customer_id=coalesce(p_customer_id,customer_id),
      installation_id=nullif(p_installation_id,''),title=coalesce(nullif(p_title,''),title),status=p_status,details=v_safe_details,updated_by=auth.uid(),updated_at=now()
    where organization_id=p_organization_id and id=p_work_order_id returning id into v_id;
  end if;
  if v_id is null then raise exception 'Werkorder niet gevonden.' using errcode='P0002'; end if;
  return v_id;
end $$;

-- Saniteer ook bestaande werkorders éénmalig, zodat oude/ongewenste velden
-- niet via een latere monteursweergave kunnen uitlekken.
update public.work_orders
set details=public.safe_work_order_details_v131(details),updated_at=now()
where details is distinct from public.safe_work_order_details_v131(details);

revoke all on function public.safe_work_order_details_v131(jsonb) from public;
grant execute on function public.safe_work_order_details_v131(jsonb) to authenticated;

commit;
