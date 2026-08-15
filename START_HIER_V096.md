# Optero v0.9.6 — Rollen, rechten & mail

Deze release hardent de teamrechten en maakt de mailflow productierijp voor de huidige fase.

## 1. Eerst Supabase bijwerken
Voer in **Supabase → SQL Editor** het volledige bestand uit:

`supabase/roles_mail_hardening_v096.sql`

Controleer daarna met:

`supabase/VERIFY_V096.sql`

Alle vijf controles horen `true` te zijn.

## 2. Nederlandse Optero-mails instellen
Custom SMTP via Resend mag aan blijven zoals al ingesteld.

Ga in Supabase naar **Authentication → Emails → Email Templates** en vervang:

- Invite user → onderwerp `Je bent uitgenodigd voor Optero` → inhoud uit `supabase/email-templates/invite.html`
- Confirm signup → onderwerp `Bevestig je Optero-account` → inhoud uit `supabase/email-templates/confirmation.html`
- Reset password → onderwerp `Stel je Optero-wachtwoord in` → inhoud uit `supabase/email-templates/recovery.html`

Laat `{{ .ConfirmationURL }}` exact staan.

## 3. GitHub / Vercel
Vervang de projectbestanden door deze versie. De bestaande environment variables blijven gelijk.

## 4. Rechten testen
### Eigenaar
- Dashboard, klanten, agenda, instellingen, medewerkers en account toegankelijk.
- Medewerker uitnodigen en opnieuw versturen werkt.

### Planner
- Dashboard, klanten en agenda toegankelijk.
- Geen bedrijfsinstellingen of medewerkersbeheer.

### Monteur
- Start direct in **Mijn dag**.
- Alleen **Mijn account** via het accounticoon.
- Geen Instellingen, Klanten, Agenda, Dashboard, Medewerkers of onderhoudsactielijst.
- De database blokkeert bovendien directe toegang tot de volledige bedrijfsdataset.

## 5. Mailstatus
Openstaande uitnodigingen tonen voortaan of de mail is verzonden of mislukt. Bij een mislukte mail kan de eigenaar **Opnieuw sturen** kiezen.
