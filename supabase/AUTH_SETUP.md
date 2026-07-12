# Supabase Auth instellen

## 1. Database

Open in Supabase **SQL Editor**, plak de volledige inhoud van `schema.sql` en voer die uit.

## 2. E-mailaccounts

Ga naar **Authentication → Sign In / Providers → Email**:

- Email provider: aan
- Allow new users to sign up: aan
- Confirm email: aan
- Minimum password length: minimaal 10 tekens aanbevolen

## 3. Redirect-URL's

Ga naar **Authentication → URL Configuration**.

Lokaal:

- Site URL: `http://localhost:5173`
- Redirect URL toevoegen: `http://localhost:5173/**`

Op Vercel voeg je later ook toe:

- `https://jouw-domein.nl/**`
- eventueel de Vercel-preview-URL met wildcard

## 4. Publieke API-waarden

Ga naar **Project Settings → API** en kopieer:

- Project URL
- Publishable key

Plaats deze in `.env.local`. Gebruik nooit een secret key of service-role key in een bestand dat met `VITE_` begint.

## 5. E-mailverzending

De standaard Supabase-mailserver is geschikt voor ontwikkeling en beperkt testen. Voor publieke registratie hoort vóór lancering een eigen SMTP-provider ingesteld te worden bij **Authentication → SMTP Settings**.
