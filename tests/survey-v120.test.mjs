import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');


assert.match(app, /Is een opname nodig\?/);
assert.match(app, /Ja, opname uitvoeren/);
assert.match(app, /Nee, geen opname nodig/);
assert.match(app, /survey\.details\?\.surveyNeeded==='no'/);
assert.match(app, /status:surveyNeeded==='no'\?'completed'/);
assert.match(app, /currentRole!==['"]technician['"]/);
assert.match(app, /Opnameafspraak verwijderen/);

assert.match(app, /SURVEY_REFRIGERANT_OPTIONS/);
assert.match(app, /Leiding & koudemiddel/);
assert.match(app, /LineLengthM/);
assert.match(app, /RefrigerantType/);
assert.match(app, /RefrigerantAmountKg/);
assert.match(app, /AdditionalRefrigerantG/);
assert.match(app, /technicalRefrigerantType/);

assert.match(app, /EXTRA WERKZAAMHEDEN/);
assert.match(app, /collectSurveyExtraWork/);
assert.match(app, /extraWorkDescription/);
assert.match(app, /extraWorkQuantity/);
assert.match(app, /extraWorkNote/);
assert.match(app, /Monteurs krijgen in Optero nergens bedragen of prijzen te zien/);
assert.doesNotMatch(app, /extraWork(?:Price|Cost|Amount|Margin)|extraWork(?:Prijs|Kosten|Bedrag|Marge)/i);

assert.match(css, /survey-extra-work-card/);
assert.match(css, /survey-not-needed-card/);
assert.match(css, /survey-system-tech/);

console.log('v0.12.0 Opname 2.0 checks: OK');
