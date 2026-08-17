import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const config = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.equal(pkg.version, '0.12.0');
assert.match(config, /APP_VERSION = '0.12.0 Opname 2.0'/);
assert.match(sw, /CACHE_NAME = 'optero-v0.12.0'/);
assert.match(app, /nav\('surveyDetail',\{appointmentId:'\$\{a\.id\}',back:'notifications'\}\)/);
assert.match(app, /if\(route\.name==='surveyDetail'\)\{[\s\S]*if\(route\.back==='notifications'\) return nav\('notifications'\)/);
assert.match(app, /if\(route\.name==='surveyEdit'\) return nav\('surveyDetail',\{[\s\S]*back:route\.back/);
assert.match(app, /nav\('surveyEdit',\{appointmentId:'\$\{appointmentId\}',back:route\.back,appointmentBack:route\.appointmentBack,date:route\.date\}\)/);
assert.match(app, /nav\('surveyDetail',\{appointmentId,back:route\.back,appointmentBack:route\.appointmentBack,date:route\.date\}\)/);
assert.match(app, /back:'appointmentDetail',appointmentBack:/);
console.log('survey-back-navigation-v118: OK');
