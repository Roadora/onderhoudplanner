import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../src/app.js', import.meta.url),'utf8');
assert.match(app,/Plaatsingsdatum[^]*Dit registreert wanneer het systeem is of wordt geplaatst/);
assert.match(app,/Onderhoudsadvies/);
assert.match(app,/Plaatsing inplannen/);
assert.match(app,/Onderhoud plannen/);
assert.match(app,/Alleen afspraken die je hier opslaat verschijnen in de agenda/);
assert.match(app,/systemId:selectedSystemId/);
assert.match(app,/preselectSoleTechnician/);
assert.match(app,/Afspraak inplannen/);
console.log('planning-flow-v101: OK');
