# OnderhoudPlanner v0.8.2 — Cloudgegevens

Deze versie bewaart de bedrijfsgegevens echt online in Supabase. De bestaande mobiele OnderhoudPlanner-interface blijft behouden.

## Wat is toegevoegd

- klanten online per bedrijfsomgeving;
- installaties online per bedrijfsomgeving;
- afspraken online per bedrijfsomgeving;
- bedrijfsinstellingen online;
- automatische migratie van bestaande v0.7/v0.8.1-browsergegevens;
- lokale cache voor korte offline momenten;
- zichtbare cloudstatus in de bovenbalk;
- atomische opslag met revisiecontrole;
- bescherming tegen het stil overschrijven van nieuwere wijzigingen vanaf een ander apparaat;
- Row Level Security op alle nieuwe tabellen;
- volledige JSON- en CSV-back-up blijft beschikbaar;
- lokale migratie- of conflictback-ups zijn via Instellingen als noodback-up te downloaden.

## Belangrijk voor jouw bestaande Supabase-project

Je hebt `supabase/schema.sql` voor v0.8.1 al uitgevoerd. Voer daarom nu alleen dit aanvullende bestand uit:

```text
supabase/cloud_schema_v082.sql
```

Open in Supabase:

```text
SQL Editor → New query
```

Plak het volledige bestand en klik op **Run**. De waarschuwing over mogelijk destructieve handelingen is normaal: het script vervangt alleen policies en functies met bekende namen. Het verwijdert geen bestaande accounttabellen of gebruikers.

Een groene melding `Success. No rows returned` betekent dat de cloudtabellen klaarstaan. Optioneel kun je daarna `supabase/VERIFY_V082.sql` uitvoeren; alle zes controles horen `true` te zijn en RLS hoort voor de vier tabellen aan te staan.

## Nieuwe tabellen

- `company_settings`
- `customers`
- `installations`
- `appointments`

Iedere rij bevat een `organization_id`. RLS controleert of de ingelogde gebruiker lid is van die bedrijfsomgeving.

## Migratie van bestaande gegevens

Bij de eerste login na deze update gebeurt het volgende:

1. de app haalt de cloudgegevens van het bedrijf op;
2. wanneer de cloud nog leeg is en in deze browser bestaande data staat, toont de app het exacte aantal klanten, installaties en afspraken;
3. na bevestiging wordt alles in één transactie naar Supabase geschreven;
4. vóór de overdracht wordt lokaal een extra herstelkopie bewaard;
5. daarna is Supabase de hoofdopslag en wordt de browser alleen nog als cache gebruikt.

Een oude lokale dataset kan nog steeds maar aan één bedrijfsaccount worden gekoppeld.

## Synchronisatie

De bovenbalk toont:

- `Opgeslagen` — cloud en apparaat zijn gelijk;
- `Opslaan…` — wijzigingen worden verzonden;
- `Wachten…` — wijziging staat in de wachtrij;
- `Offline` — wijziging blijft lokaal en wordt later verzonden;
- `Niet gesynchroniseerd` — de cloudverbinding is mislukt.

Wanneer dezelfde bedrijfsomgeving op twee apparaten tegelijk wordt gewijzigd, voorkomt een datarevisie dat een oudere kopie stilletjes de nieuwste versie overschrijft. Bij een conflict wordt de lokale versie als browserback-up bewaard en de nieuwste cloudversie opnieuw geladen.

## Installeren en lokaal starten

Gebruik Node.js 24.x.

```bash
npm ci
npm run dev
```

Open normaal:

```text
http://localhost:5173
```

## Omgevingsvariabelen

De bestaande Vercel-variabelen blijven hetzelfde:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Gebruik uitsluitend de Supabase Publishable key. Zet nooit een secret- of service-role key in een `VITE_`-variabele.

## Publiceren via GitHub en Vercel

1. Vervang de repositorybestanden door de inhoud van deze map.
2. Houd `package.json`, `package-lock.json`, `.npmrc` en `vercel.json` in de hoofdmap.
3. Commit en push naar `main`.
4. Controleer in Vercel:
   - Framework: `Vite`
   - Node.js: `24.x`
   - Build command: `npm run build`
   - Output directory: `dist`
5. Deploy zonder oude buildcache.

Voer bij voorkeur eerst `cloud_schema_v082.sql` uit. Anders toont de app na inloggen terecht dat de cloudtabellen nog ontbreken.

## Structuur

```text
src/data/cloud-repository.js   cloud laden, migreren en synchroniseren
src/data/local-repository.js   lokale cache per organisatie
src/auth/                      accounts en bedrijfsomgeving
supabase/cloud_schema_v082.sql aanvullende migratie voor jouw live project
supabase/schema.sql            volledig schema voor een nieuw project
```

## Nog niet in v0.8.2

- Stripe Checkout;
- verplichte betaalmethode vóór de proefperiode;
- 14-daagse proefperiode en abonnementsblokkade;
- meerdere medewerkers per bedrijf;
- servergestuurde e-mail- of WhatsApp-herinneringen.

De volgende versie wordt **v0.9 Betalingen** met Stripe Checkout, een verplichte betaalmethode en automatische toegang op basis van de abonnementsstatus.
