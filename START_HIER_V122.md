# Optero v0.12.2 — Opname → offerte → werkorder

## Eenmalig na het kopiëren van de gewijzigde bestanden

1. Open **Supabase → SQL Editor**.
2. Open het bestand `supabase/quotes_workorders_v122.sql` uit deze update.
3. Voer het bestand **één keer volledig** uit.
4. Push daarna de gewijzigde bestanden via GitHub Desktop zodat Vercel opnieuw deployt.
5. Sluit de geïnstalleerde Optero-app één keer volledig en open hem opnieuw.

## Snelle controle

- Bedrijfsaccount toont `0.12.2 Werkorderflow`.
- Een opname bevat geen koudemiddel- of uitvoeringsvelden meer.
- Na een afgeronde opname ziet alleen de eigenaar **Offerte maken**.
- Bij het opslaan van de offerte ontstaat automatisch een **conceptwerkorder**.
- Pas bij offertestatus **Akkoord** kan de werkorder worden ingepland.
- De planner/eigenaar vult de technische werkorder in zonder prijsvelden.
- De monteur opent de ingeplande werkorder via **Mijn dag** en kan extra leiding, extra koudemiddel en extra werkzaamheden registreren.
- De monteur ziet nergens offertebedragen, prijzen, kostprijzen of marges.
