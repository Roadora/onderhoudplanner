-- OnderhoudPlanner v0.9.5 — Team-onboarding herbouw
begin;

create extension if not exists pgcrypto with schema extensions;

alter table public.team_invitations
  add column if not exists activation_token_hash text,
  add column if not exists activation_created_at timestamptz;

create unique index if not exists team_invitations_activation_token_hash_uidx
  on public.team_invitations (activation_token_hash)
  where activation_token_hash is not null;

grant select, insert, update, delete on table public.team_invitations to authenticated;

create or replace function public.complete_team_invitation(
  p_activation_token text,
  p_display_name text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, extensions, pg_temp
as $$
declare
  v_inv public.team_invitations%rowtype;
  v_email text;
  v_hash text;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Niet ingelogd.' using errcode = '42501';
  end if;

  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is null then
    raise exception 'Account kon niet worden gecontroleerd.' using errcode = '42501';
  end if;

  v_hash := encode(extensions.digest(coalesce(p_activation_token, ''), 'sha256'), 'hex');
  v_name := left(trim(coalesce(p_display_name, '')), 100);

  select * into v_inv
  from public.team_invitations
  where activation_token_hash = v_hash
    and status = 'pending'
  for update;

  if not found then
    raise exception 'Activatielink is ongeldig, verlopen of al gebruikt.' using errcode = 'P0002';
  end if;

  if v_inv.expires_at < now() then
    update public.team_invitations
      set status = 'expired', activation_token_hash = null
      where id = v_inv.id;
    raise exception 'Activatielink is verlopen.' using errcode = 'P0002';
  end if;

  if lower(v_inv.email) <> v_email then
    raise exception 'Deze activatielink hoort bij een ander e-mailadres.' using errcode = '42501';
  end if;

  insert into public.profiles(id, email, full_name, updated_at)
  values(auth.uid(), v_email, coalesce(nullif(v_name, ''), split_part(v_email, '@', 1)), now())
  on conflict(id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        updated_at = now();

  insert into public.organization_members(organization_id, user_id, role, display_name, status, updated_at)
  values(
    v_inv.organization_id,
    auth.uid(),
    v_inv.role,
    coalesce(nullif(v_name, ''), split_part(v_email, '@', 1)),
    'active',
    now()
  )
  on conflict(organization_id, user_id) do update
    set role = excluded.role,
        display_name = excluded.display_name,
        status = 'active',
        updated_at = now();

  update public.team_invitations
    set status = 'accepted',
        accepted_at = now(),
        activation_token_hash = null
    where id = v_inv.id;

  return jsonb_build_object(
    'organization_id', v_inv.organization_id,
    'role', v_inv.role
  );
end;
$$;

revoke all on function public.complete_team_invitation(text, text) from public;
grant execute on function public.complete_team_invitation(text, text) to authenticated;

commit;
