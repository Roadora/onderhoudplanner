# Optero v0.13.0 — Aanvragen & inbox

- Centrale pagina **Aanvragen** toegevoegd voor website- en e-mailaanvragen.
- Nieuwe aanvragen verschijnen ook onder **Aandacht nodig** en in de **Actielijst**.
- Aanvraaggegevens kunnen met één actie als klant worden opgeslagen of aan een bestaande klant worden gekoppeld.
- Exacte e-mail/telefoonmatches worden als mogelijke bestaande klant gesignaleerd.
- Vanuit een verwerkte aanvraag kan direct een opname worden ingepland.
- Beveiligde server-side website-intake toegevoegd met unieke source key + secret per bedrijf.
- Nieuwe **Integraties**-pagina voor website, Microsoft 365/Outlook, Gmail/Google Workspace en generieke IMAP/SSL-mailboxen.
- OAuth authorization-code flow voor Microsoft en Google toegevoegd; refresh tokens worden AES-256-GCM versleuteld opgeslagen. Voor IMAP wordt het mailboxwachtwoord op dezelfde manier server-side versleuteld opgeslagen.
- Mailboxsync slaat onbekende externe afzenders als nieuwe aanvraag op en slaat bestaande klanten en duidelijke automatische mails over.
- Monteurs hebben geen toegang tot aanvragen, integraties of mailboxen.
- PWA-cache en zichtbare versie verhoogd naar v0.13.0.
