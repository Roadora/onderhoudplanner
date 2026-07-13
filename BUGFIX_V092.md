# OnderhoudPlanner v0.9.2 — uitnodigingsautorisatie

- Eigenaarcontrole loopt nu via de geauthenticeerde gebruikerssessie en de bestaande RLS-policy.
- De geheime Supabase-sleutel wordt alleen nog gebruikt voor Supabase Auth Admin (uitnodigingsmail en accountcontrole).
- Teamleden tellen en uitnodigingen opslaan verlopen met de rechten van de ingelogde eigenaar.
- Geen aanvullende SQL-migratie nodig.
