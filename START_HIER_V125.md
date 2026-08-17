# Optero v0.12.5 – Slimme offertes & prijzenboek

## 1. Gewijzigde bestanden plaatsen
Plaats de bestanden uit deze update over dezelfde paden in de bestaande Optero-repository en push daarna via GitHub Desktop.

## 2. Eenmalig Supabase uitvoeren
Open **Supabase → SQL Editor**, plak de volledige inhoud van:

`supabase/price_book_v125.sql`

en klik op **Run**.

Dit maakt het bedrijfsgebonden prijzenboek aan. Alleen de eigenaar kan de bedragen via de beveiligde RPC-functies lezen of wijzigen.

## 3. Controleren na Vercel-deploy
- Bedrijfsaccount toont `0.12.5 Slimme offertes`.
- Meer → Prijzenboek opent voor de eigenaar.
- Maak een opname met bijvoorbeeld een single split en een multi split.
- Open daarna Offerte maken: Optero moet twee hoofdregels tonen, één per compleet systeem.
- Vul een prijs handmatig in. Het label moet `Handmatig aangepast` tonen.
- Gebruik `Opslaan als standaardprijs`; bij een volgende overeenkomstige opname wordt die standaardprijs voorgesteld.
- Wijzig de voorgestelde prijs in een offerte: het prijzenboek mag daardoor niet automatisch veranderen.
