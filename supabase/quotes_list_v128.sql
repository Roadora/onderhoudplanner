-- Optero v0.12.8 — centraal offerteoverzicht
-- Voer dit bestand één keer volledig uit in Supabase > SQL Editor.

begin;

create or replace function public.list_quotes_v128(p_organization_id uuid)
returns table(
  id uuid,
  survey_appointment_id text,
  customer_id text,
  customer_name text,
  status text,
  items jsonb,
  notes text,
  total_amount numeric,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path=public,auth,pg_temp
as $$
  select
    q.id,
    q.survey_appointment_id,
    q.customer_id,
    coalesce(c.name,'') as customer_name,
    q.status,
    coalesce(q.items,'[]'::jsonb),
    coalesce(q.notes,''),
    q.total_amount,
    q.created_at,
    q.updated_at
  from public.quotes q
  left join public.customers c
    on c.organization_id=q.organization_id and c.id=q.customer_id
  where q.organization_id=p_organization_id
    and public.is_organization_owner(p_organization_id)
  order by q.updated_at desc;
$$;

grant execute on function public.list_quotes_v128(uuid) to authenticated;

commit;
