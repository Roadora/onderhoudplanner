# Optero v0.12.8 — Offerteoverzicht

- Nieuwe centrale pagina **Meer → Offertes** voor de eigenaar.
- Alle offertes tonen klant, status, totaalbedrag, aantal regels en laatste wijzigingsdatum.
- Filter op Alle, Concept, Verstuurd, Akkoord en Afgewezen.
- Offertes zijn rechtstreeks vanuit het overzicht te openen.
- Terugnavigatie vanuit een offerte keert terug naar het offerteoverzicht wanneer de offerte daarvandaan is geopend.
- Navigatie via het prijzenboek bewaart dezelfde herkomst.
- Nieuwe afgeschermde Supabase-RPC `list_quotes_v128`; offertes en bedragen blijven alleen toegankelijk voor de eigenaar.
- Oudere v0.12.7-regressietest is versie-onafhankelijk gemaakt zodat toekomstige releases niet onterecht falen.
