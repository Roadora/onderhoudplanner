import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

assert.match(app, /Is een opname nodig\?/);
assert.match(app, /Ja, opname uitvoeren/);
assert.match(app, /Nee, geen opname nodig/);
assert.match(app, /survey\.details\?\.surveyNeeded==='no'/);
assert.match(app, /status:'completed'/);
assert.match(app, /Opname opslaan en afronden/);
assert.match(app, /currentRole!==['"]technician['"]/);
assert.match(app, /Opnameafspraak verwijderen/);

// v0.12.2: koelmiddel en uitvoering horen niet langer in het opnameformulier.
const surveyEditStart=app.indexOf('async function surveyEditPage');
const surveyEditEnd=app.indexOf('async function deleteGenericAppointment', surveyEditStart);
const surveyEdit=app.slice(surveyEditStart,surveyEditEnd);
assert.doesNotMatch(surveyEdit, /surveyTechnicalCard|addSurveyExtraWork|surveyExtraWorkList/);
assert.match(app, /workOrderExecutePage/);
assert.match(app, /Extra koudemiddel bijgevuld \(g\)/);
assert.match(app, /Extra leiding gebruikt \(m\)/);
assert.match(app, /In dit scherm bestaan geen kosten-, prijs- of margevelden/);
assert.match(css, /survey-not-needed-card/);

console.log('v0.12.2 opname is vereenvoudigd en uitvoering staat op werkorder: OK');
