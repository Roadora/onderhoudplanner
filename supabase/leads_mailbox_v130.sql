-- Optero v0.13.0 — Aanvragen, website-intake en mailboxkoppelingen
-- Vereist o.a. schema.sql / cloud_schema_v082.sql en roles_mail_hardening_v096.sql.
-- Voer dit bestand één keer volledig uit in Supabase > SQL Editor.

begin;

create table if not exists public.lead_intakes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_type text not null check (source_type in ('website','email','manual')),
  source_label text not null default '',
  status text not null default 'new' check (status in ('new','reviewing','converted','linked','dismissed')),
  name text not null default '',
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  postal_code text not null default '',
  city text not null default '',
  subject text not null default '',
  message text not null default '',
  provider_message_id text,
  customer_id text,
  source_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  handled_by uuid references auth.users(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lead_intakes_customer_fk foreign key (organization_id,customer_id)
    references public.customers(organization_id,id) on delete set null
);

create unique index if not exists lead_intakes_provider_message_unique
  on public.lead_intakes(organization_id,source_type,provider_message_id)
  where provider_message_id is not null and provider_message_id <> '';
create index if not exists lead_intakes_org_status_idx
  on public.lead_intakes(organization_id,status,received_at desc);
create index if not exists lead_intakes_org_email_idx
  on public.lead_intakes(organization_id,lower(email));

create table if not exists public.website_intake_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null default 'Website',
  public_key text not null unique,
  secret_hash text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists website_intake_sources_org_idx
  on public.website_intake_sources(organization_id,active,created_at desc);

create table if not exists public.mailbox_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  provider text not null check (provider in ('microsoft','google','imap')),
  mailbox_email text not null,
  display_name text not null default '',
  status text not null default 'connected' check (status in ('connected','needs_reauth','disconnected')),
  refresh_token_enc text not null,
  imap_host text not null default '',
  imap_port integer not null default 993 check (imap_port between 1 and 65535),
  imap_username text not null default '',
  scopes text[] not null default '{}'::text[],
  connected_by uuid references auth.users(id) on delete set null,
  last_synced_at timestamptz,
  last_sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,provider,mailbox_email)
);
create index if not exists mailbox_connections_org_idx
  on public.mailbox_connections(organization_id,status,updated_at desc);

alter table public.lead_intakes enable row level security;
alter table public.website_intake_sources enable row level security;
alter table public.mailbox_connections enable row level security;
revoke all on public.lead_intakes from anon,authenticated;
revoke all on public.website_intake_sources from anon,authenticated;
revoke all on public.mailbox_connections from anon,authenticated;

create or replace function public.list_leads_v130(p_organization_id uuid,p_status text default null)
returns table(
  id uuid,source_type text,source_label text,status text,name text,email text,phone text,address text,
  postal_code text,city text,subject text,message text,customer_id text,received_at timestamptz,updated_at timestamptz
)
language sql stable security definer set search_path=public,auth,pg_temp as $$
  select l.id,l.source_type,l.source_label,l.status,l.name,l.email,l.phone,l.address,
    l.postal_code,l.city,l.subject,l.message,l.customer_id,l.received_at,l.updated_at
  from public.lead_intakes l
  where l.organization_id=p_organization_id
    and public.has_organization_role(p_organization_id,array['owner','planner']::text[])
    and (p_status is null or p_status='' or l.status=p_status)
  order by case when l.status='new' then 0 when l.status='reviewing' then 1 else 2 end,l.received_at desc;
$$;

create or replace function public.get_lead_v130(p_organization_id uuid,p_lead_id uuid)
returns table(
  id uuid,source_type text,source_label text,status text,name text,email text,phone text,address text,
  postal_code text,city text,subject text,message text,customer_id text,received_at timestamptz,updated_at timestamptz
)
language sql stable security definer set search_path=public,auth,pg_temp as $$
  select l.id,l.source_type,l.source_label,l.status,l.name,l.email,l.phone,l.address,
    l.postal_code,l.city,l.subject,l.message,l.customer_id,l.received_at,l.updated_at
  from public.lead_intakes l
  where l.organization_id=p_organization_id and l.id=p_lead_id
    and public.has_organization_role(p_organization_id,array['owner','planner']::text[]);
$$;

create or replace function public.update_lead_v130(
  p_organization_id uuid,p_lead_id uuid,p_status text,p_customer_id text default null
)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
  if not public.has_organization_role(p_organization_id,array['owner','planner']::text[]) then
    raise exception 'Geen rechten om aanvragen te behandelen.' using errcode='42501';
  end if;
  if coalesce(p_status,'') not in ('new','reviewing','converted','linked','dismissed') then
    raise exception 'Ongeldige aanvraagstatus.';
  end if;
  if p_customer_id is not null and p_customer_id<>'' and not exists(
    select 1 from public.customers c where c.organization_id=p_organization_id and c.id=p_customer_id
  ) then raise exception 'Klant niet gevonden.'; end if;

  update public.lead_intakes set
    status=p_status,
    customer_id=case when p_customer_id is null or p_customer_id='' then customer_id else p_customer_id end,
    handled_by=case when p_status in ('converted','linked','dismissed') then auth.uid() else handled_by end,
    handled_at=case when p_status in ('converted','linked','dismissed') then now() else handled_at end,
    updated_at=now()
  where organization_id=p_organization_id and id=p_lead_id;
  if not found then raise exception 'Aanvraag niet gevonden.' using errcode='P0002'; end if;
  return p_lead_id;
end $$;

create or replace function public.list_mailbox_connections_v130(p_organization_id uuid)
returns table(id uuid,provider text,mailbox_email text,display_name text,status text,imap_host text,imap_port integer,imap_username text,last_synced_at timestamptz,last_sync_error text,updated_at timestamptz)
language sql stable security definer set search_path=public,auth,pg_temp as $$
  select m.id,m.provider,m.mailbox_email,m.display_name,m.status,m.imap_host,m.imap_port,m.imap_username,m.last_synced_at,m.last_sync_error,m.updated_at
  from public.mailbox_connections m
  where m.organization_id=p_organization_id and public.is_organization_owner(p_organization_id)
  order by m.updated_at desc;
$$;

create or replace function public.disconnect_mailbox_v130(p_organization_id uuid,p_connection_id uuid)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
  if not public.is_organization_owner(p_organization_id) then
    raise exception 'Alleen de eigenaar kan mailboxen beheren.' using errcode='42501';
  end if;
  update public.mailbox_connections set status='disconnected',refresh_token_enc='',updated_at=now()
  where organization_id=p_organization_id and id=p_connection_id;
  if not found then raise exception 'Mailboxkoppeling niet gevonden.' using errcode='P0002'; end if;
  return p_connection_id;
end $$;

create or replace function public.list_website_sources_v130(p_organization_id uuid)
returns table(id uuid,name text,public_key text,active boolean,created_at timestamptz,updated_at timestamptz)
language sql stable security definer set search_path=public,auth,pg_temp as $$
  select w.id,w.name,w.public_key,w.active,w.created_at,w.updated_at
  from public.website_intake_sources w
  where w.organization_id=p_organization_id and public.is_organization_owner(p_organization_id)
  order by w.created_at desc;
$$;

create or replace function public.deactivate_website_source_v130(p_organization_id uuid,p_source_id uuid)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
  if not public.is_organization_owner(p_organization_id) then
    raise exception 'Alleen de eigenaar kan websitekoppelingen beheren.' using errcode='42501';
  end if;
  update public.website_intake_sources set active=false,updated_at=now()
  where organization_id=p_organization_id and id=p_source_id;
  if not found then raise exception 'Websitekoppeling niet gevonden.' using errcode='P0002'; end if;
  return p_source_id;
end $$;

revoke all on function public.list_leads_v130(uuid,text),public.get_lead_v130(uuid,uuid),public.update_lead_v130(uuid,uuid,text,text),public.list_mailbox_connections_v130(uuid),public.disconnect_mailbox_v130(uuid,uuid),public.list_website_sources_v130(uuid),public.deactivate_website_source_v130(uuid,uuid) from public;
grant execute on function public.list_leads_v130(uuid,text),public.get_lead_v130(uuid,uuid),public.update_lead_v130(uuid,uuid,text,text),public.list_mailbox_connections_v130(uuid),public.disconnect_mailbox_v130(uuid,uuid),public.list_website_sources_v130(uuid),public.deactivate_website_source_v130(uuid,uuid) to authenticated;

commit;
