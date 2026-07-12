-- OnderhoudPlanner v0.8.1 — Accounts en bedrijfsomgevingen
-- Voer dit complete bestand één keer uit in Supabase > SQL Editor.

begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  full_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  subscription_status text not null default 'setup'
    check (subscription_status in ('setup','trialing','active','past_due','canceled')),
  trial_ends_at timestamptz,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner'
    check (role in ('owner','planner','technician','viewer')),
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index if not exists organization_members_user_id_idx
  on public.organization_members(user_id);
create unique index if not exists organizations_owner_user_id_unique
  on public.organizations(owner_user_id);

-- Security-definer helpers voorkomen recursieve RLS-controles op de ledentabel.
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
  );
$$;

create or replace function public.is_organization_owner(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.organizations organization
    where organization.id = p_organization_id
      and organization.owner_user_id = auth.uid()
  );
$$;

revoke all on function public.is_organization_member(uuid) from public;
revoke all on function public.is_organization_owner(uuid) from public;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.is_organization_owner(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;

-- Herhaalbaar: verwijder eerst alleen de policies met deze bekende namen.
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (id = auth.uid());
create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

drop policy if exists "organizations_select_member_or_owner" on public.organizations;
drop policy if exists "organizations_insert_own" on public.organizations;
drop policy if exists "organizations_update_owner" on public.organizations;
create policy "organizations_select_member_or_owner"
  on public.organizations for select to authenticated
  using (
    owner_user_id = auth.uid()
    or public.is_organization_member(id)
  );
create policy "organizations_insert_own"
  on public.organizations for insert to authenticated
  with check (
    owner_user_id = auth.uid()
    and subscription_status = 'setup'
    and trial_ends_at is null
    and stripe_customer_id is null
    and stripe_subscription_id is null
  );
create policy "organizations_update_owner"
  on public.organizations for update to authenticated
  using (owner_user_id = auth.uid())
  with check (owner_user_id = auth.uid());

drop policy if exists "members_select_company" on public.organization_members;
drop policy if exists "members_insert_initial_owner" on public.organization_members;
drop policy if exists "members_update_owner" on public.organization_members;
create policy "members_select_company"
  on public.organization_members for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_organization_member(organization_id)
  );
create policy "members_insert_initial_owner"
  on public.organization_members for insert to authenticated
  with check (
    user_id = auth.uid()
    and role = 'owner'
    and public.is_organization_owner(organization_id)
  );
create policy "members_update_owner"
  on public.organization_members for update to authenticated
  using (public.is_organization_owner(organization_id))
  with check (public.is_organization_owner(organization_id));

-- Tabellen zijn via de publieke API alleen voor ingelogde gebruikers bruikbaar;
-- de RLS-policies bepalen vervolgens welke rijen toegankelijk zijn.
grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.organizations to authenticated;
grant update (name, updated_at) on public.organizations to authenticated;
grant select, insert, update on public.organization_members to authenticated;

commit;
