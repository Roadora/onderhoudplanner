# OnderhoudPlanner v0.8.0 — Technische basis

Deze versie zet de bestaande v0.7-app om naar een compact Vite-project. Alle huidige functies blijven lokaal werken. Accounts, Supabase en Stripe zijn bewust nog niet geactiveerd; die volgen in de volgende stappen.

## Starten in VS Code

1. Pak de zip uit.
2. Open de map in VS Code.
3. Open de geïntegreerde terminal.
4. Voer uit:

```bash
npm install
npm run dev
```

Open daarna het lokale adres dat Vite toont, normaal `http://localhost:5173`.

## Productiebouw testen

```bash
npm run build
npm run preview
```

De productiebestanden komen in `dist/`.

## Publiceren op Vercel

- Zet deze map in een GitHub-repository.
- Importeer de repository in Vercel.
- Framework preset: Vite.
- Build command: `npm run build`.
- Output directory: `dist`.

## Gegevensbehoud

De lokale opslagnaam is bewust gelijk gebleven aan v0.7:

`onderhoudplanner_v07_pilot`

Wanneer v0.8 op dezelfde domeinnaam en in dezelfde browser wordt geopend, worden bestaande klanten, installaties en afspraken automatisch gebruikt. Een andere localhost-poort of domeinnaam heeft technisch een eigen browseropslag. Gebruik daarom vóór een verhuizing altijd de JSON-back-upfunctie.

## Structuur

```text
public/                  vaste PWA-assets
src/main.js              applicatiestart
src/app.js               bestaande schermen en bedrijfslogica
src/styles.css            vormgeving
src/config.js             versie en publieke runtimeconfiguratie
src/data/local-repository.js tijdelijke lokale opslaglaag
src/pwa.js                serviceworkerregistratie
```

## Volgende stap

v0.8.1 voegt toe:

- registreren en inloggen via Supabase Auth;
- e-mailbevestiging en wachtwoordherstel;
- een eigen organisatie per installatiebedrijf;
- beveiligde sessie en uitloggen;
- voorbereide migratie van lokale v0.7/v0.8-data.

Stripe komt pas nadat de account- en gegevensscheiding betrouwbaar werkt. De uiteindelijke openbare registratie vereist een betaalmethode bij het starten van de 14-daagse proefperiode.
