begin;

create table if not exists public.price_book_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category text not null check (category in ('system','extra')),
  label text not null,
  system_type text not null default '',
  brand text not null default '',
  model text not null default '',
  unit text not null default 'stuk',
  unit_price numeric(12,2) not null default 0 check (unit_price >= 0),
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists price_book_org_category_idx
  on public.price_book_items(organization_id,category,active,label);

create unique index if not exists price_book_system_signature_unique
  on public.price_book_items(organization_id,system_type,lower(brand),lower(model))
  where category='system';

create unique index if not exists price_book_extra_signature_unique
  on public.price_book_items(organization_id,lower(label),unit)
  where category='extra';

alter table public.price_book_items enable row level security;
revoke all on public.price_book_items from anon, authenticated;

create or replace function public.list_price_book_v125(p_organization_id uuid)
returns table(
  id uuid,
  category text,
  label text,
  system_type text,
  brand text,
  model text,
  unit text,
  unit_price numeric,
  active boolean,
  updated_at timestamptz
)
language sql stable security definer set search_path=public,auth,pg_temp as $$
  select p.id,p.category,p.label,p.system_type,p.brand,p.model,p.unit,p.unit_price,p.active,p.updated_at
  from public.price_book_items p
  where p.organization_id=p_organization_id
    and public.is_organization_owner(p_organization_id)
  order by p.category,p.label,p.brand,p.model,p.updated_at desc;
$$;

create or replace function public.upsert_price_book_item_v125(
  p_organization_id uuid,
  p_item_id uuid,
  p_category text,
  p_label text,
  p_system_type text,
  p_brand text,
  p_model text,
  p_unit text,
  p_unit_price numeric,
  p_active boolean
)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
declare v_id uuid;
begin
  if not public.is_organization_owner(p_organization_id) then
    raise exception 'Alleen de eigenaar heeft toegang tot het prijzenboek.' using errcode='42501';
  end if;
  if coalesce(p_category,'') not in ('system','extra') then raise exception 'Ongeldige prijscategorie.'; end if;
  if nullif(trim(coalesce(p_label,'')),'') is null then raise exception 'Omschrijving is verplicht.'; end if;
  if coalesce(p_unit_price,0) < 0 then raise exception 'Prijs mag niet negatief zijn.'; end if;

  if p_item_id is null then
    insert into public.price_book_items(
      organization_id,category,label,system_type,brand,model,unit,unit_price,active,created_by,updated_by
    ) values(
      p_organization_id,p_category,trim(p_label),trim(coalesce(p_system_type,'')),trim(coalesce(p_brand,'')),trim(coalesce(p_model,'')),
      coalesce(nullif(trim(coalesce(p_unit,'')),''),'stuk'),coalesce(p_unit_price,0),coalesce(p_active,true),auth.uid(),auth.uid()
    ) returning id into v_id;
  else
    update public.price_book_items set
      category=p_category,
      label=trim(p_label),
      system_type=trim(coalesce(p_system_type,'')),
      brand=trim(coalesce(p_brand,'')),
      model=trim(coalesce(p_model,'')),
      unit=coalesce(nullif(trim(coalesce(p_unit,'')),''),'stuk'),
      unit_price=coalesce(p_unit_price,0),
      active=coalesce(p_active,true),
      updated_by=auth.uid(),
      updated_at=now()
    where organization_id=p_organization_id and id=p_item_id
    returning id into v_id;
  end if;

  if v_id is null then raise exception 'Prijsboekregel niet gevonden.' using errcode='P0002'; end if;
  return v_id;
end $$;

create or replace function public.delete_price_book_item_v125(p_organization_id uuid,p_item_id uuid)
returns uuid language plpgsql security definer set search_path=public,auth,pg_temp as $$
begin
  if not public.is_organization_owner(p_organization_id) then
    raise exception 'Alleen de eigenaar heeft toegang tot het prijzenboek.' using errcode='42501';
  end if;
  delete from public.price_book_items where organization_id=p_organization_id and id=p_item_id;
  if not found then raise exception 'Prijsboekregel niet gevonden.' using errcode='P0002'; end if;
  return p_item_id;
end $$;

revoke all on function public.list_price_book_v125(uuid),public.upsert_price_book_item_v125(uuid,uuid,text,text,text,text,text,text,numeric,boolean),public.delete_price_book_item_v125(uuid,uuid) from public;
grant execute on function public.list_price_book_v125(uuid),public.upsert_price_book_item_v125(uuid,uuid,text,text,text,text,text,text,numeric,boolean),public.delete_price_book_item_v125(uuid,uuid) to authenticated;

commit;
