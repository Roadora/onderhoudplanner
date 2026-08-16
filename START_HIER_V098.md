# Optero v0.9.8 — Monteurskalender

Alleen de gewijzigde bestanden uit deze update staan in deze zip.

## Wat is aangepast
- Monteur krijgt een normale maandkalender in `Mijn dag`.
- Dagen met toegewezen opdrachten krijgen een markering.
- Een datum aantikken toont direct de eigen opdrachten van die datum.
- Vorige/volgende maand en `Naar vandaag` toegevoegd.
- De oude blauwe werkdagkaart, dubbele datum, kop `Vandaag` en kaart `Medewerkeromgeving` zijn verwijderd.
- Monteur blijft uitsluitend eigen toegewezen werkzaamheden laden.
- Monteursdata wordt nu 31 dagen terug en 365 dagen vooruit geladen, zodat toekomstige opdrachten in de kalender zichtbaar zijn.
- Mobiele UX van de kalender is compacter gemaakt.

## Database
Geen nieuwe SQL-migratie nodig. De bestaande v0.9.7 werktoewijzing en RLS blijven gebruikt worden.

## Plaatsen
Kopieer de bestanden uit deze zip over dezelfde paden in de repository en deploy daarna opnieuw.
