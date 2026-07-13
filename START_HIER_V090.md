# OnderhoudPlanner v0.9.0 — Rollen & medewerkers

1. Voer `supabase/team_schema_v090.sql` uit in Supabase SQL Editor.
2. Voeg in Vercel toe: `SUPABASE_SERVICE_ROLE_KEY` (alleen Production/Preview, Sensitive aan). Gebruik de service_role key uit Supabase en plaats die nooit in GitHub of frontendcode.
3. Voeg `VITE_APP_URL=https://onderhoudplanner.nl` toe zodra het eigen domein live is; voorlopig kan `https://onderhoudplanner.vercel.app`.
4. Upload deze projectbestanden naar GitHub en laat Vercel deployen.
5. Open Instellingen > Medewerkers en verstuur een uitnodiging.

Deze versie legt de rol- en uitnodigingsbasis. De volgende versie koppelt werkopdrachten aan medewerkers en beperkt de monteurweergave tot toegewezen opdrachten.
