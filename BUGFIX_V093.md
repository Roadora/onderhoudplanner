# OnderhoudPlanner v0.9.3 — Heruitnodigingsfix

- Een bestaande `pending` teamuitnodiging wordt veilig hergebruikt.
- Rol, uitnodiger en vervaldatum worden bij opnieuw uitnodigen vernieuwd.
- Geen revoke/delete-stap meer die kan botsen met RLS of de unieke statusconstraint.
- Teamuitnodigingen worden met de ingelogde eigenaarssessie beheerd; de service-role client blijft alleen voor Supabase Auth admin-acties.
- Geen nieuwe SQL-migratie nodig.
