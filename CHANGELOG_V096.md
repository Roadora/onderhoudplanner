# Optero v0.9.6

- Zichtbare branding van OnderhoudPlanner naar Optero bijgewerkt.
- Centrale route-autorisatie toegevoegd per rol.
- Monteur beperkt tot `Mijn dag` en `Mijn account`.
- Bedrijfsinstellingen eigenaar-only gemaakt.
- Medewerkersbeheer en uitnodigingen eigenaar-only gemaakt.
- Planner behoudt operationele planning, klanten en agenda, maar geen bedrijfsbeheer.
- Cloudstatus en onderhoudsactielijst verborgen voor monteurs zolang werkopdracht-scoping nog niet is gebouwd.
- Globale browseracties per rol beperkt.
- Actief lidmaatschap verplicht bij het openen van een bedrijfsomgeving.
- RLS-hardening: monteurs kunnen de volledige klanten-, installatie-, afspraken- en instellingen-tabellen niet via de API uitlezen.
- Cloud-RPC's server-side beperkt tot eigenaar/planner.
- Teamledenlijst via RPC beperkt tot eigenaar/planner.
- Uitnodigingsmailstatus toegevoegd: sending, sent, mail_failed.
- Veilige, begrijpelijke foutmelding bij mail-rate-limit of verzendfout.
- Knop `Opnieuw sturen` toegevoegd voor openstaande uitnodigingen.
- Nederlandse Optero-templates meegeleverd voor uitnodiging, accountbevestiging en wachtwoordherstel.
- PWA-branding en cacheversie bijgewerkt naar Optero v0.9.6.
- Nieuwe statische rechtencontrole toegevoegd.
