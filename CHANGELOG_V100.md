# Optero v0.10.0 — Transactionele cloudopslag

- Supabase is voortaan de leidende bron bij iedere normale login.
- Dagelijkse synchronisatie gebruikt een niet-destructieve merge met revisiecontrole.
- Een oude browsercache kan daardoor geen afspraken, klanten of installaties van een ander apparaat meer verwijderen.
- Verwijderen gebeurt uitsluitend via expliciete, server-side RPC-functies.
- Verwijderen van klant/installatie respecteert database-cascades en werktoewijzingen.
- De terugkerende legacy-importmelding is uit de normale loginflow verwijderd.
- Monteurs krijgen nooit legacy-importlogica.
- Uitloggen blijft geblokkeerd zolang wijzigingen niet veilig in Supabase staan.
