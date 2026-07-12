# v0.8.2

- Klanten, installaties, afspraken en bedrijfsinstellingen naar Supabase verplaatst.
- Nieuwe RLS-beveiligde tabellen per `organization_id` toegevoegd.
- Atomische cloudopslag via `replace_organization_state` toegevoegd.
- Datarevisie toegevoegd om overschrijven door een verouderd tweede apparaat te voorkomen.
- Automatische, gecontroleerde migratie van lokale v0.7/v0.8.1-data toegevoegd.
- Lokale browsercache en offline wachtrij behouden.
- Cloudstatus in de appheader en instellingen toegevoegd.
- Uitloggen wacht waar mogelijk op de laatste cloudsynchronisatie.
- Volledig schema en additieve v0.8.2-migratie toegevoegd.
- Versie bijgewerkt naar 0.8.2.

# v0.8.1c

- Package-lock uitsluitend via de openbare npm-registry.
- Vercel-installatie op `npm ci` gezet.

# v0.8.1

- Supabase Auth toegevoegd.
- Registreren, e-mailbevestiging, inloggen en wachtwoordherstel.
- Automatische organisatie per bedrijfsaccount.
- RLS voor accounts en organisaties.
