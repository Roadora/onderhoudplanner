# Optero v0.13.1 — Workflow audit

- Blokkerende fout in beveiligde mailbox/API-aanroepen opgelost: actieve bedrijfsaccount staat nu correct in scope.
- Nieuwe aanvraag blijft onder **Aandacht nodig** zolang `Klant + opname inplannen` nog niet daadwerkelijk als opnameafspraak in de cloud is opgeslagen.
- Afgeronde opname volgt nu de nieuwe commerciële workflow: **opname → offerte/werkorder** in plaats van de oude controle op een willekeurige vervolgafspraak.
- Zodra een offerte wordt opgeslagen en daardoor een conceptwerkorder bestaat, verdwijnt het opname-aandachtspunt automatisch.
- Werkorders nemen nu alle complete systemen uit een opname mee in plaats van alleen het eerste systeem.
- Planner/eigenaar kan technische werkordergegevens per systeem voorbereiden: type, merk, model, leidinglengte en koudemiddelgegevens.
- Binnenunits/ruimtes/vermogens uit de opname blijven per systeem zichtbaar op de werkorder.
- Opnamefoto's zijn nu rechtstreeks zichtbaar op de werkorder voor kantoor én voor de toegewezen monteur.
- Toegang tot opnamefoto's is server-side uitgebreid zodat een monteur die aan de uitvoeringswerkorder is toegewezen de bijbehorende opnamefoto's veilig kan lezen.
- Werkorder-details worden server-side via een technische whitelist opgeslagen en uitgelezen. Kosten, prijzen, marges en andere commerciële velden kunnen daardoor niet via `details` naar het monteursportaal lekken.
- Bestaande werkorder-details worden door de migratie éénmalig gesaneerd.
- PWA-cache en zichtbare versie verhoogd naar v0.13.1.
