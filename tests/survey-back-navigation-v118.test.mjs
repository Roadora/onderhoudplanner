import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');

assert.match(app, /nav\('surveyDetail',\{appointmentId:'\$\{a\.id\}',back:'notifications'\}\)/);
assert.match(app, /if\(route\.name==='surveyDetail'\)\{[\s\S]*if\(route\.back==='notifications'\) return nav\('notifications'\)/);
assert.match(app, /if\(route\.name==='surveyEdit'\) return nav\('surveyDetail',\{[\s\S]*back:route\.back/);
assert.match(app, /id=\"surveyEditBtn\"/);
assert.match(app, /surveyEditBtn\.onclick=\(\)=>nav\('surveyEdit',\{[\s\S]*appointmentId,[\s\S]*back:route\.back,[\s\S]*appointmentBack:route\.appointmentBack,[\s\S]*date:route\.date/);
assert.doesNotMatch(app, /onclick=\"[^\"]*(?:back|appointmentBack|date):route\./);
assert.match(app, /nav\('surveyDetail',\{appointmentId,back:route\.back,appointmentBack:route\.appointmentBack,date:route\.date\}\)/);
assert.match(app, /back:'appointmentDetail',appointmentBack:/);
console.log('survey-back-navigation-v118: OK');
