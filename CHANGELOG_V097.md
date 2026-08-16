# Optero v0.9.7 — Werktoewijzing & data-isolatie

- Lokale browsercache is nu gescheiden per organisatie én gebruiker.
- Bij uitloggen wordt de lokale cache van de huidige gebruiker verwijderd.
- Bestaande organisatiecache wordt alleen voor eigenaar/planner éénmalig naar de nieuwe gebruikersscope gemigreerd.
- Nieuwe `work_order_assignments`-tabel ondersteunt meerdere medewerkers per afspraak/opdracht.
- Eigenaar/planner kan in afspraakformulieren één of meerdere medewerkers toewijzen.
- Monteur haalt via `get_my_assigned_work` uitsluitend eigen toegewezen werkzaamheden plus uitsluitend bijbehorende klant- en installatiegegevens op.
- Monteur kan een toegewezen opdracht openen, maar niet bewerken of verwijderen.
- Planner kan via de cloud-RPC geen bedrijfsinstellingen meer wijzigen; een database-trigger bewaakt dit server-side.
- Uitnodigings-API gebruikt zonder `VITE_APP_URL` veilig de actuele deployment-host in plaats van het oude OnderhoudPlanner-adres.
- Nieuwe automatische checks voor cache-isolatie, werktoewijzing en plannerrechten.
