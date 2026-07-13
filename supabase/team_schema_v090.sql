-- OnderhoudPlanner v0.9.0 — Rollen & medewerkers
begin;

alter table public.organization_members
  add column if not exists display_name text not null default '',
  add column if not exists status text not null default 'active'
    check (status in ('active','disabled')),
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('planner','technician')),
  invited_by uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id,email,status)
);

alter table public.team_invitations enable row level security;

drop policy if exists "team_invites_manage_owner_planner" on public.team_invitations;
create policy "team_invites_manage_owner_planner"
on public.team_invitations for all to authenticated
using (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = team_invitations.organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner','planner')
  )
)
with check (
  exists (
    select 1 from public.organization_members m
    where m.organization_id = team_invitations.organization_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner','planner')
  )
);

create or replace function public.accept_team_invitation(p_invitation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_inv public.team_invitations%rowtype;
  v_email text;
begin
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is null then raise exception 'Niet ingelogd.' using errcode='42501'; end if;

  select * into v_inv from public.team_invitations
  where id = p_invitation_id and status='pending' for update;

  if not found then raise exception 'Uitnodiging niet gevonden of verlopen.' using errcode='P0002'; end if;
  if v_inv.expires_at < now() then
    update public.team_invitations set status='expired' where id=v_inv.id;
    raise exception 'Uitnodiging is verlopen.' using errcode='P0002';
  end if;
  if lower(v_inv.email) <> v_email then raise exception 'Deze uitnodiging hoort bij een ander e-mailadres.' using errcode='42501'; end if;

  insert into public.organization_members(organization_id,user_id,role,display_name,status)
  values(v_inv.organization_id,auth.uid(),v_inv.role,split_part(v_inv.email,'@',1),'active')
  on conflict(organization_id,user_id) do update set role=excluded.role,status='active',updated_at=now();

  update public.team_invitations set status='accepted',accepted_at=now() where id=v_inv.id;
  return jsonb_build_object('organization_id',v_inv.organization_id,'role',v_inv.role);
end;
$$;

grant execute on function public.accept_team_invitation(uuid) to authenticated;

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
    and public.is_organization_member(p_organization_id)
  order by case m.role when 'owner' then 0 when 'planner' then 1 else 2 end, coalesce(m.display_name,u.email);
$$;

grant execute on function public.list_team_members(uuid) to authenticated;
commit;
