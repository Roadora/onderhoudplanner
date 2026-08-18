# Optero v0.13.0 — Aanvragen & inbox

## 1. Database eenmalig bijwerken
Voer in **Supabase → SQL Editor** het volledige bestand uit:

`supabase/leads_mailbox_v130.sql`

Dit maakt de beveiligde tabellen en RPC's voor aanvragen, websitebronnen en mailboxkoppelingen.

## 2. Vercel-variabelen
De bestaande Supabase-variabelen blijven nodig. Voeg voor de nieuwe serverfuncties ook toe:

- `SUPABASE_SERVICE_ROLE_KEY`
- `OPTERO_MAILBOX_TOKEN_KEY`
- `OPTERO_OAUTH_STATE_SECRET`

Maak een willekeurige 32-byte sleutel bijvoorbeeld lokaal met:

`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

Gebruik servergeheimen **nooit** met een `VITE_` prefix.

## 3. Websiteaanvragen
Ga in Optero als eigenaar naar **Meer → Integraties → Websitekoppeling maken**.
Optero toont één keer een `Source key` en `Secret`.

De bedrijfswebsite moet het formulier **server-side** doorsturen naar:

`POST https://<jouw-optero-domein>/api/intake/website`

Headers:

- `x-optero-source-key: <Source key>`
- `x-optero-source-secret: <Secret>`
- `content-type: application/json`

Ondersteunde velden zijn o.a. `name`, `email`, `phone`, `address`, `postalCode`, `city`, `subject` en `message`.
Zet het Secret nooit rechtstreeks in browser-JavaScript van de website.

> De Optero-kant is na deze update klaar. De bestaande bedrijfswebsite moet nog één keer worden aangepast zodat haar formulier deze server-side POST uitvoert.

## 4. Microsoft 365 / Outlook koppelen
Maak in Microsoft Entra een web-appregistratie en voeg als redirect URI toe:

`https://<jouw-optero-domein>/api/mailbox/oauth-callback`

Voeg delegated toegang toe voor `User.Read` en `Mail.Read`; Optero vraagt daarnaast `offline_access`, `openid`, `profile` en `email` in de OAuth-flow.
Zet daarna `MICROSOFT_CLIENT_ID` en `MICROSOFT_CLIENT_SECRET` in Vercel.
Zorg ook dat `VITE_APP_URL` in Vercel op het definitieve Optero-domein staat, zodat de OAuth-redirect exact overeenkomt.

Daarna: **Meer → Integraties → Microsoft 365 koppelen**.

## 5. Gmail / Google Workspace koppelen
Maak een Google Cloud OAuth web-client, schakel de Gmail API in en voeg dezelfde redirect URI toe:

`https://<jouw-optero-domein>/api/mailbox/oauth-callback`

Zet `GOOGLE_CLIENT_ID` en `GOOGLE_CLIENT_SECRET` in Vercel.
Daarna: **Meer → Integraties → Gmail / Google koppelen**.


## 6. Andere provider via IMAP/SSL
Voor zakelijke mailboxen die niet op Microsoft 365 of Google Workspace staan, kan de eigenaar in **Meer → Integraties → Andere e-mailprovider (IMAP/SSL)** rechtstreeks de beveiligde IMAP-gegevens invullen.

Vul in:

- e-mailadres van de mailbox;
- IMAP-server;
- beveiligde IMAP-poort (meestal `993`);
- gebruikersnaam;
- mailboxwachtwoord of app-wachtwoord dat de provider voorschrijft.

Optero test de verbinding eerst via TLS. Het wachtwoord wordt daarna alleen server-side versleuteld opgeslagen met `OPTERO_MAILBOX_TOKEN_KEY`; het wordt niet naar planners of monteurs teruggestuurd.

Deze connector gebruikt alleen een directe IMAP/SSL-verbinding. Onversleutelde IMAP en een losse STARTTLS-configuratie zijn bewust niet ondersteund in v0.13.0.

## 7. Nieuwe e-mails
Optero synchroniseert de gekoppelde inbox bij het openen van Home/Actielijst/Aanvragen en via **Mailbox nu synchroniseren**.

- afzenders die al als klant bestaan worden niet als nieuwe klant klaargezet;
- duidelijke automatische/no-reply mails worden overgeslagen;
- een onbekende externe afzender wordt als **Nieuwe aanvraag** klaargezet;
- de gebruiker kan klant aanmaken, aan een bestaande klant koppelen, direct een opname inplannen of de aanvraag afwijzen.

In v0.13.0 wordt alleen metadata plus de provider-snippet opgeslagen, niet de volledige mailbox of bijlagen.
