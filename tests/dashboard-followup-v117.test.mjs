import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

assert.match(app, /listSurveys/);
assert.match(app, /surveyRequiresFollowUp/);
assert.match(app, /buildSurveyFollowUps/);
assert.match(app, /Er is nog geen vervolgafspraak ingepland/);
assert.match(app, /Afgeronde opnames · vervolg nodig/);
assert.match(app, /Vervolg plannen/);
assert.match(app, /appointmentMomentKey\(a\)>=opnameMoment/);
console.log('dashboard-followup-v117: OK');
