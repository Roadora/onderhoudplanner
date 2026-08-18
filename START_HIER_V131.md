# Optero v0.13.1 — Workflow audit

## 1. Bestanden plaatsen
Plaats de gewijzigde bestanden uit deze update over de bestaande Optero-repository en push naar GitHub/Vercel.

## 2. Supabase eenmalig bijwerken
Voer daarna in **Supabase → SQL Editor** het volledige bestand uit:

`supabase/workflow_hardening_v131.sql`

Dit bestand:

- geeft een toegewezen monteur veilige toegang tot de opname en opnamefoto's die bij zijn werkorder horen;
- voegt server-side filtering van technische werkordergegevens toe;
- vervangt de bestaande werkorder-RPC's met geharde varianten;
- saneert bestaande werkorder-details éénmalig.

De eerdere `leads_mailbox_v130.sql` hoeft niet opnieuw te worden uitgevoerd als die al succesvol is uitgevoerd.

## 3. Vercel
Er zijn voor v0.13.1 **geen nieuwe environment variables** nodig. De variabelen uit v0.13.0 blijven gelden.

Na de deploy moet bij **Bedrijfsaccount → Versie** staan:

`0.13.1 Workflow audit`

## 4. Praktijktest
Test daarna bij voorkeur in deze volgorde:

1. synchroniseer een mailbox of gebruik later een echte onbekende e-mail;
2. open de aanvraag via **Aandacht nodig**;
3. kies **Klant + opname inplannen**;
4. ga vóór opslaan één keer terug en controleer dat de aanvraag bij Aandacht nodig blijft staan;
5. plan de opname daadwerkelijk in en sla hem op;
6. vul de opname in, voeg meerdere systemen en enkele foto's toe en rond hem af;
7. controleer dat **Aandacht nodig** nu meldt dat een offerte nodig is;
8. maak en sla een offerte op;
9. controleer dat het opname-aandachtspunt verdwijnt;
10. zet de offerte op **Akkoord** en open de werkorder;
11. controleer dat alle systemen en opnamefoto's zichtbaar zijn;
12. plan de werkorder op een monteur;
13. log in als monteur, open de werkorder via **Mijn dag** en controleer systemen/foto's;
14. registreer extra leiding/koudemiddel/werkzaamheden en rond de uitvoering af;
15. controleer dat de monteur nergens prijzen, kosten of marges ziet.
