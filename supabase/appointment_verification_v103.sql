-- Optero v0.10.3 - veilige afspraakverificatie
-- Houdt public.appointments dicht voor directe browserqueries.
-- Eigenaar/planner kan via deze smalle RPC uitsluitend controleren of één afspraak
-- uit de eigen organisatie daadwerkelijk is opgeslagen.

begin;

create or replace function public.verify_appointment_persisted_v103(
  p_organization_id uuid,
  p_appointment_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth, pg_temp
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Niet aangemeld.' using errcode = '42501';
  end if;

  if not public.has_organization_role(
    p_organization_id,
    array['owner','planner']::text[]
  ) then
    raise exception 'Geen rechten om deze afspraak te controleren.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', a.id,
    'appointment_date', a.appointment_date,
    'appointment_time', a.appointment_time,
    'updated_at', a.updated_at
  )
  into v_result
  from public.appointments a
  where a.organization_id = p_organization_id
    and a.id = p_appointment_id;

  return v_result;
end;
$$;

revoke all on function public.verify_appointment_persisted_v103(uuid,text) from public;
grant execute on function public.verify_appointment_persisted_v103(uuid,text) to authenticated;

-- Defense in depth: afspraken blijven rechtstreeks gesloten voor browseraccounts.
revoke all on public.appointments from authenticated;

commit;
