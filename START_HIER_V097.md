# Optero v0.9.7 — Werktoewijzing & data-isolatie

1. Voer eerst `supabase/work_assignment_isolation_v097.sql` volledig uit in Supabase SQL Editor.
2. Voer daarna `supabase/VERIFY_V097.sql` uit. Alle vijf controles horen `true` te zijn.
3. Upload/deploy daarna deze v0.9.7-bestanden naar GitHub/Vercel.
4. Controleer in Vercel dat `VITE_APP_URL` naar de actuele Optero-URL wijst. Zodra het domein live is: `https://optero.nl`.
5. Test als eigenaar/planner: maak een afspraak en vink één of meerdere medewerkers aan.
6. Log uit en log op dezelfde browser als monteur in. Alleen de aan deze monteur toegewezen opdrachten mogen onder `Mijn dag` verschijnen.
7. Open een opdracht als monteur: klant/installatiegegevens van die opdracht mogen zichtbaar zijn, maar bewerken/verwijderen niet.
8. Log opnieuw als eigenaar in en controleer dat de volledige bedrijfsdata nog normaal synchroniseert.
