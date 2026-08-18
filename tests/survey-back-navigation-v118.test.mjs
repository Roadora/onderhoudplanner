import fs from 'node:fs';
import assert from 'node:assert/strict';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const config = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
const sw = fs.readFileSync(new URL('../public/service-worker.js', import.meta.url), 'utf8');
const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

assert.match(pkg.version, /^0\.\d+\.\d+$/);
assert.ok(config.includes(`APP_VERSION = '${pkg.version} `), 'Zichtbare appversie moet gelijk lopen met package.json');
assert.ok(sw.includes(`CACHE_NAME = 'optero-v${pkg.version}'`), 'PWA-cacheversie moet gelijk lopen met package.json');
assert.match(app, /nav\('surveyDetail',\{appointmentId:'\$\{a\.id\}',back:'notifications'\}\)/);
assert.match(app, /if\(route\.name==='surveyDetail'\)\{[\s\S]*if\(route\.back==='notifications'\) return nav\('notifications'\)/);
assert.match(app, /if\(route\.name==='surveyEdit'\) return nav\('surveyDetail',\{[\s\S]*back:route\.back/);
assert.match(app, /surveyEditBtn\.onclick=\(\)=>nav\('surveyEdit',\{[\s\S]*appointmentId,[\s\S]*back:route\.back,[\s\S]*appointmentBack:route\.appointmentBack,[\s\S]*date:route\.date/);
assert.match(app, /nav\('surveyDetail',\{appointmentId,back:route\.back,appointmentBack:route\.appointmentBack,date:route\.date\}\)/);
assert.match(app, /back:'appointmentDetail',appointmentBack:/);
console.log('survey-back-navigation-v118: OK');
