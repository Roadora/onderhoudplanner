# Supabase-instelling voor OnderhoudPlanner v0.8.2

## Bestaand live project

Voer in **SQL Editor** alleen uit:

```text
cloud_schema_v082.sql
```

## Volledig nieuw project

Voer één keer uit:

```text
schema.sql
```

Dat bestand bevat zowel accounts als cloudgegevens.

## Auth-controle

Bij **Authentication → Sign In / Providers**:

- nieuwe gebruikers toestaan: aan;
- Email provider: aan;
- Confirm email: aan;
- anonymous sign-ins: uit.

Bij **Authentication → URL Configuration**:

```text
Site URL: https://onderhoudplanner.vercel.app
Redirect URL: https://onderhoudplanner.vercel.app/**
Redirect URL lokaal: http://localhost:5173/**
```

## Vercel-variabelen

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
```

Gebruik nooit een secret key of service-role key in de frontend.
