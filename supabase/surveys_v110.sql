-- Optero v0.11.0 — Opnames
begin;

create table if not exists public.surveys (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  purpose text not null default 'nieuwe_installatie',
  scope text not null default '',
  findings text not null default '',
  technical_notes text not null default '',
  status text not null default 'planned' check(status in ('planned','in_progress','completed')),
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(organization_id,appointment_id)
);

create table if not exists public.survey_photos (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  storage_path text not null unique,
  caption text not null default '',
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.surveys enable row level security;
alter table public.survey_photos enable row level security;
revoke all on public.surveys, public.survey_photos from anon, authenticated;

create or replace function public.can_access_survey_v110(p_organization_id uuid,p_appointment_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.has_organization_role(p_organization_id,array['owner','planner']::text[])
  or exists(select 1 from public.work_order_assignments w where w.organization_id=p_organization_id and w.appointment_id=p_appointment_id and w.user_id=auth.uid());
$$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('opname-fotos','opname-fotos',false,8388608,array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "opname_fotos_select" on storage.objects;
drop policy if exists "opname_fotos_insert" on storage.objects;
drop policy if exists "opname_fotos_delete" on storage.objects;
create policy "opname_fotos_select" on storage.objects for select to authenticated
using(bucket_id='opname-fotos' and public.can_access_survey_v110((storage.foldername(name))[1]::uuid,(storage.foldername(name))[2]::uuid));
create policy "opname_fotos_insert" on storage.objects for insert to authenticated
with check(bucket_id='opname-fotos' and public.can_access_survey_v110((storage.foldername(name))[1]::uuid,(storage.foldername(name))[2]::uuid));
create policy "opname_fotos_delete" on storage.objects for delete to authenticated
using(bucket_id='opname-fotos' and public.can_access_survey_v110((storage.foldername(name))[1]::uuid,(storage.foldername(name))[2]::uuid));

create or replace function public.can_access_survey_v110(p_organization_id uuid,p_appointment_id uuid)
returns boolean language sql stable security definer set search_path=public,pg_temp as $$
  select public.has_organization_role(p_organization_id,array['owner','planner']::text[])
  or exists(select 1 from public.work_order_assignments w where w.organization_id=p_organization_id and w.appointment_id=p_appointment_id and w.user_id=auth.uid());
$$;

create or replace function public.list_surveys_v110(p_organization_id uuid)
returns table(appointment_id uuid,purpose text,scope text,findings text,technical_notes text,status text,updated_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 select s.appointment_id,s.purpose,s.scope,s.findings,s.technical_notes,s.status,s.updated_at
 from public.surveys s join public.appointments a on a.organization_id=s.organization_id and a.id=s.appointment_id
 where s.organization_id=p_organization_id and public.has_organization_role(p_organization_id,array['owner','planner']::text[])
 order by a.appointment_date desc,a.appointment_time desc;
$$;

create or replace function public.get_survey_v110(p_organization_id uuid,p_appointment_id uuid)
returns table(appointment_id uuid,purpose text,scope text,findings text,technical_notes text,status text,updated_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 select s.appointment_id,s.purpose,s.scope,s.findings,s.technical_notes,s.status,s.updated_at
 from public.surveys s where s.organization_id=p_organization_id and s.appointment_id=p_appointment_id
 and public.can_access_survey_v110(p_organization_id,p_appointment_id);
$$;

create or replace function public.upsert_survey_v110(p_organization_id uuid,p_appointment_id uuid,p_purpose text,p_scope text,p_findings text,p_technical_notes text,p_status text)
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not public.can_access_survey_v110(p_organization_id,p_appointment_id) then raise exception 'Geen toegang tot deze opname'; end if;
 if not exists(select 1 from public.appointments a where a.organization_id=p_organization_id and a.id=p_appointment_id and a.type='opname') then raise exception 'Deze afspraak is geen opname'; end if;
 insert into public.surveys(organization_id,appointment_id,purpose,scope,findings,technical_notes,status,created_by,updated_by)
 values(p_organization_id,p_appointment_id,coalesce(nullif(p_purpose,''),'nieuwe_installatie'),coalesce(p_scope,''),coalesce(p_findings,''),coalesce(p_technical_notes,''),coalesce(nullif(p_status,''),'planned'),auth.uid(),auth.uid())
 on conflict(organization_id,appointment_id) do update set purpose=excluded.purpose,scope=excluded.scope,findings=excluded.findings,technical_notes=excluded.technical_notes,status=excluded.status,updated_by=auth.uid(),updated_at=now();
 return p_appointment_id;
end $$;

create or replace function public.list_survey_photos_v110(p_organization_id uuid,p_appointment_id uuid)
returns table(id uuid,storage_path text,caption text,created_at timestamptz)
language sql stable security definer set search_path=public,pg_temp as $$
 select p.id,p.storage_path,p.caption,p.created_at from public.survey_photos p
 where p.organization_id=p_organization_id and p.appointment_id=p_appointment_id and public.can_access_survey_v110(p_organization_id,p_appointment_id)
 order by p.created_at;
$$;

create or replace function public.register_survey_photo_v110(p_organization_id uuid,p_appointment_id uuid,p_storage_path text,p_caption text default '')
returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare v_id uuid;
begin
 if not public.can_access_survey_v110(p_organization_id,p_appointment_id) then raise exception 'Geen toegang tot deze opname'; end if;
 if p_storage_path not like p_organization_id::text||'/'||p_appointment_id::text||'/%' then raise exception 'Ongeldig fotopad'; end if;
 insert into public.survey_photos(organization_id,appointment_id,storage_path,caption,uploaded_by) values(p_organization_id,p_appointment_id,p_storage_path,coalesce(p_caption,''),auth.uid()) returning id into v_id;
 return v_id;
end $$;

create or replace function public.delete_survey_photo_v110(p_organization_id uuid,p_photo_id uuid)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare v_path text; v_appointment uuid;
begin
 select storage_path,appointment_id into v_path,v_appointment from public.survey_photos where organization_id=p_organization_id and id=p_photo_id;
 if v_path is null or not public.can_access_survey_v110(p_organization_id,v_appointment) then raise exception 'Geen toegang tot deze foto'; end if;
 delete from public.survey_photos where organization_id=p_organization_id and id=p_photo_id;
 return v_path;
end $$;

revoke all on function public.can_access_survey_v110(uuid,uuid),public.list_surveys_v110(uuid),public.get_survey_v110(uuid,uuid),public.upsert_survey_v110(uuid,uuid,text,text,text,text,text),public.list_survey_photos_v110(uuid,uuid),public.register_survey_photo_v110(uuid,uuid,text,text),public.delete_survey_photo_v110(uuid,uuid) from public;
grant execute on function public.can_access_survey_v110(uuid,uuid),public.list_surveys_v110(uuid),public.get_survey_v110(uuid,uuid),public.upsert_survey_v110(uuid,uuid,text,text,text,text,text),public.list_survey_photos_v110(uuid,uuid),public.register_survey_photo_v110(uuid,uuid,text,text),public.delete_survey_photo_v110(uuid,uuid) to authenticated;

commit;
