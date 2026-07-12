# Start hier — v0.8.2 live zetten

1. Open Supabase → **SQL Editor → New query**.
2. Plak en voer volledig uit:

   ```text
   supabase/cloud_schema_v082.sql
   ```

3. Controleer optioneel met:

   ```text
   supabase/VERIFY_V082.sql
   ```

   De zes eerste waarden horen `true` te zijn en RLS hoort bij alle vier tabellen aan te staan.

4. Vervang daarna de bestanden in je GitHub-repository door de inhoud van deze map en commit naar `main`.
5. Laat Vercel opnieuw deployen met Node.js `24.x`.
6. Log in op `https://onderhoudplanner.vercel.app`.

Wanneer in deze browser bestaande klanten staan en de cloud nog leeg is, vraagt de app eenmalig of je die gegevens wilt overzetten. Controleer de aantallen en kies **OK**. Wacht daarna tot bovenin **Opgeslagen** staat.
