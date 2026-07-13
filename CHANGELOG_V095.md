# v0.9.5

- Medewerker-onboarding opnieuw opgebouwd na volledige audit.
- Eenmalige, gehashte activatietokens in de database.
- Uniforme activatie voor nieuwe en reeds bestaande Supabase-gebruikers.
- Supabase Auth gebruikt voor de beveiligde e-mailsessie; de uitnodiging zelf wordt uitsluitend vanuit de database gevalideerd.
- Medewerkers kunnen bij een mislukte activatie niet automatisch eigenaar van een nieuw bedrijf worden.
- Oude URL- en user-metadata-uitnodigingslogica verwijderd.
- Complete SQL-migratie inclusief ontbrekende tabelprivileges.
- Automatische onboardingcontroles toegevoegd.
