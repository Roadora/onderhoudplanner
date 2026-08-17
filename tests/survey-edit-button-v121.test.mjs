import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const config = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '0.12.1');
assert.match(config, /APP_VERSION = '0\.12\.1 Opname-audit'/);
assert.match(sw, /CACHE_NAME = 'optero-v0\.12\.1'/);

// Module-scoped route state must never be referenced from inline HTML handlers.
assert.match(app, /id=\"surveyEditBtn\"/);
assert.match(app, /const surveyEditBtn=\$\('#surveyEditBtn'\)/);
assert.match(app, /surveyEditBtn\.onclick=\(\)=>nav\('surveyEdit',\{[\s\S]*appointmentId,[\s\S]*back:route\.back,[\s\S]*appointmentBack:route\.appointmentBack,[\s\S]*date:route\.date/);
assert.doesNotMatch(app, /onclick=\"[^\"]*(?:back|appointmentBack|date):route\./);

// Both detail -> edit and edit -> detail preserve the source route.
assert.match(app, /if\(route\.name==='surveyEdit'\) return nav\('surveyDetail',\{[\s\S]*back:route\.back/);
assert.match(app, /nav\('surveyDetail',\{appointmentId,back:route\.back,appointmentBack:route\.appointmentBack,date:route\.date\}\)/);

console.log('survey-edit-button-v121: OK');
