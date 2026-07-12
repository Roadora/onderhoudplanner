# OnderhoudPlanner v0.8.1a — Accounts + Vercel Node 20-fix

Deze versie voegt echte bedrijfsaccounts toe met Supabase Auth. Zonder geldig en bevestigd account blijft het onderhoudsdashboard afgesloten.


## Belangrijke Vercel-fix in v0.8.1a

Deze versie zet Vercel expliciet op **Node.js 24.x** via `package.json`. Nieuwe Vercel-projecten gebruiken anders standaard Node.js 24.x. In npm zijn actuele meldingen bekend waarbij `npm install` op Node.js 22/24 kan stoppen met `Exit handler never called!`. Node.js 24 werkt in die meldingen wel.

Na upload naar GitHub: controleer in Vercel onder **Settings → Build and Deployment → Node.js Version** dat `24.x` staat en start daarna een nieuwe deployment zonder oude buildcache.

## Wat werkt in v0.8.1

- bedrijfsaccount registreren;
- verplichte e-mailbevestiging;
- inloggen en sessie onthouden;
- wachtwoord vergeten en nieuw wachtwoord instellen;
- automatisch één eigen organisatie per account;
- accountpagina en veilig uitloggen;
- bedrijfsnaam en contactpersoon synchroniseren met Supabase;
- Row Level Security op profielen, organisaties en organisatieleden;
- bestaande v0.7/v0.8.0-data eenmalig aan het eerste account koppelen;
- lokale onderhoudsdata gescheiden per bedrijfsaccount.

## Belangrijke tussenstap

De accounts en bedrijfsomgeving staan online in Supabase. Klanten, installaties, afspraken en onderhoudsinstellingen staan in **v0.8.1 nog lokaal in de browser**, maar met een aparte opslag per organisatie. In v0.8.2 worden deze gegevens naar beveiligde Supabase-tabellen verplaatst.

Gebruik tot die stap de JSON-back-upfunctie voordat je van apparaat, browser of domein wisselt.

## 1. Supabase-project maken

1. Maak een nieuw Supabase-project.
2. Open **SQL Editor**.
3. Plak de volledige inhoud van `supabase/schema.sql`.
4. Klik op **Run**.

Het script maakt aan:

- `profiles`;
- `organizations`;
- `organization_members`;
- RLS-policies en beveiligde hulpfuncties.

Een ingelogde gebruiker kan alleen zijn eigen profiel en bedrijfsomgeving lezen. De toekomstige betaalstatus kan niet door de gebruiker zelf op `active` worden gezet.

## 2. E-mailbevestiging instellen

Ga in Supabase naar **Authentication → Sign In / Providers → Email** en zet aan:

- Email provider;
- Allow new users to sign up;
- Confirm email.

Stel bij voorkeur een minimale wachtwoordlengte van 10 tekens in.

## 3. Redirect-URL's instellen

Ga naar **Authentication → URL Configuration**.

Voor lokaal testen:

```text
Site URL: http://localhost:5173
Redirect URL: http://localhost:5173/**
```

Voor productie wordt de Site URL je definitieve app-URL, bijvoorbeeld:

```text
https://app.jouwdomein.nl
```

Voeg de exacte productie-URL toe aan Redirect URLs. Voor tijdelijke Vercel previews kan aanvullend een passende wildcard worden toegevoegd.

## 4. SMTP instellen

De standaard Supabase-mailserver verstuurt in de huidige configuratie alleen naar e-mailadressen van projectteamleden en heeft een zeer lage limiet. Voor registratie door echte bedrijven moet daarom een eigen SMTP-provider worden ingesteld via **Authentication → SMTP Settings**.

Geschikte voorbeelden zijn Resend, Postmark, Brevo of Amazon SES. De SMTP-wachtwoorden komen alleen in Supabase en nooit in deze frontend.

## 5. Omgevingsvariabelen

Kopieer `.env.example` naar `.env.local`:

```bash
cp .env.example .env.local
```

Op Windows kan dit ook handmatig in Verkenner of VS Code.

Vul daarna in:

```text
VITE_SUPABASE_URL=https://jouw-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_APP_URL=http://localhost:5173/
```

Gebruik in de frontend uitsluitend de **Publishable key**. Zet nooit een `sb_secret_...`-key of service-role key in een `VITE_`-variabele.

## 6. Lokaal starten

Vereist voor deze stabiele Vercel-versie: Node.js 24.x (minimaal 20.19).

```bash
npm install
npm run dev
```

Open daarna het adres dat Vite toont, normaal:

```text
http://localhost:5173
```

Na wijzigen van `.env.local` moet de ontwikkelserver opnieuw worden gestart.

## 7. Accountflow testen

1. Klik op **Bedrijfsaccount aanmaken**.
2. Vul bedrijfsnaam, naam, e-mailadres en wachtwoord in.
3. Open de bevestigingsmail.
4. Klik op de bevestigingslink.
5. OnderhoudPlanner maakt automatisch de organisatie en eigenaar-koppeling aan.
6. Controleer rechtsboven via de initialen de accountpagina.
7. Test uitloggen, opnieuw inloggen en wachtwoord vergeten.

Gebruik voor een scheidingstest twee verschillende e-mailaccounts. Beide accounts horen een eigen lege bedrijfsomgeving te krijgen.

## 8. Bestaande lokale gegevens

Wanneer deze versie in dezelfde browser en op dezelfde oorsprong wordt geopend als v0.7/v0.8.0, vraagt de app eenmalig:

> Wil je de bestaande OnderhoudPlanner-gegevens koppelen aan dit bedrijfsaccount?

Na bevestiging worden de lokale gegevens onder het organisatie-ID opgeslagen. De oude ongescheiden kopie wordt uit veiligheid niet automatisch verwijderd. Eén oude dataset kan maar aan één bedrijfsaccount worden geclaimd.

## 9. Publiceren op Vercel

- zet de projectmap in GitHub;
- importeer de repository in Vercel;
- Framework preset: **Vite**;
- Build command: `npm run build`;
- Output directory: `dist`;
- voeg de drie publieke `VITE_`-variabelen toe bij Vercel Environment Variables;
- voeg daarna de definitieve Vercel-/domein-URL toe aan Supabase URL Configuration.

## Structuur

```text
src/auth/auth-controller.js   registratie, login en wachtwoordherstel
src/auth/account-service.js   profiel en organisatie aanmaken/beheren
src/lib/supabase.js           publieke Supabase-client
src/account-context.js        actieve gebruiker en organisatie
src/data/local-repository.js  tijdelijke opslag per organisatie
supabase/schema.sql           tabellen, privileges en RLS
supabase/AUTH_SETUP.md        korte Supabase-checklist
```

## Nog niet in deze versie

- klanten en installaties online opslaan;
- meerdere medewerkers per bedrijf;
- Stripe Checkout en verplichte betaalmethode;
- 14-daagse proefperiode;
- automatische e-mail- of WhatsApp-herinneringen.

De eerstvolgende stap is **v0.8.2 Cloudgegevens**. Daarna volgt Stripe, waarbij het abonnement pas start nadat de betaalmethode tijdens de 14-daagse proefaanmelding is vastgelegd.


## Vercel Node-versie

Deze versie gebruikt Node.js `24.x`. Stel in Vercel bij **Settings → Build and Deployment → Node.js Version** eveneens `24.x` in. Start daarna een nieuwe deployment zonder oude buildcache.
