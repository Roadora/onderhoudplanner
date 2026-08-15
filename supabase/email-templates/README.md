# Optero e-mailtemplates — Supabase hosted

Deze bestanden zijn bedoeld om in het Supabase Dashboard te plakken onder **Authentication → Emails → Email Templates**.

Gebruik:

- **Invite user**
  - Subject: `Je bent uitgenodigd voor Optero`
  - HTML: `invite.html`
- **Confirm signup**
  - Subject: `Bevestig je Optero-account`
  - HTML: `confirmation.html`
- **Reset password / Recovery**
  - Subject: `Stel je Optero-wachtwoord in`
  - HTML: `recovery.html`

De templates gebruiken `{{ .ConfirmationURL }}`. Laat deze placeholder exact staan; Supabase vult hier de beveiligde verificatie-/redirectlink in.

Custom SMTP staat los van deze templates: Resend verzorgt de aflevering, Supabase Auth bepaalt wanneer de auth-mail wordt verstuurd en rendert de template.
