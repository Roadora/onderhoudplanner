-- Optero v0.11.2 — Dynamische opnameformulieren
begin;

alter table public.surveys
  add column if not exists details jsonb not null default '{}'::jsonb;

create or replace function public.list_surveys_v112(p_organization_id uuid)
returns table(appointment_id text,purpose text,scope text,findings text,technical_notes text,status text,details jsonb,updated_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 select s.appointment_id,s.purpose,s.scope,s.findings,s.technical_notes,s.status,coalesce(s.details,'{}'::jsonb),s.updated_at
 from public.surveys s join public.appointments a on a.organization_id=s.organization_id and a.id=s.appointment_id
 where s.organization_id=p_organization_id and public.has_organization_role(p_organization_id,array['owner','planner']::text[])
 order by a.appointment_date desc,a.appointment_time desc;
$$;

create or replace function public.get_survey_v112(p_organization_id uuid,p_appointment_id text)
returns table(appointment_id text,purpose text,scope text,findings text,technical_notes text,status text,details jsonb,updated_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 select s.appointment_id,s.purpose,s.scope,s.findings,s.technical_notes,s.status,coalesce(s.details,'{}'::jsonb),s.updated_at
 from public.surveys s
 where s.organization_id=p_organization_id and s.appointment_id=p_appointment_id
 and public.can_access_survey_v110(p_organization_id,p_appointment_id);
$$;

create or replace function public.upsert_survey_v112(
  p_organization_id uuid,
  p_appointment_id text,
  p_purpose text,
  p_scope text,
  p_findings text,
  p_technical_notes text,
  p_status text,
  p_details jsonb default '{}'::jsonb
)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.can_access_survey_v110(p_organization_id,p_appointment_id) then raise exception 'Geen toegang tot deze opname'; end if;
 if not exists(select 1 from public.appointments a where a.organization_id=p_organization_id and a.id=p_appointment_id and a.type='opname') then raise exception 'Deze afspraak is geen opname'; end if;
 if coalesce(p_purpose,'') not in ('nieuwe_installatie','vervanging','uitbreiding','storing_onderzoek','onderhoud','anders') then raise exception 'Ongeldig type opname'; end if;
 if coalesce(p_status,'') not in ('planned','in_progress','completed') then raise exception 'Ongeldige status'; end if;
 insert into public.surveys(organization_id,appointment_id,purpose,scope,findings,technical_notes,status,details,created_by,updated_by)
 values(p_organization_id,p_appointment_id,p_purpose,coalesce(p_scope,''),coalesce(p_findings,''),coalesce(p_technical_notes,''),p_status,coalesce(p_details,'{}'::jsonb),auth.uid(),auth.uid())
 on conflict(organization_id,appointment_id) do update set
   purpose=excluded.purpose,
   scope=excluded.scope,
   findings=excluded.findings,
   technical_notes=excluded.technical_notes,
   status=excluded.status,
   details=excluded.details,
   updated_by=auth.uid(),
   updated_at=now();
 return p_appointment_id;
end $$;

revoke all on function public.list_surveys_v112(uuid),public.get_survey_v112(uuid,text),public.upsert_survey_v112(uuid,text,text,text,text,text,text,jsonb) from public;
grant execute on function public.list_surveys_v112(uuid),public.get_survey_v112(uuid,text),public.upsert_survey_v112(uuid,text,text,text,text,text,text,jsonb) to authenticated;

commit;
