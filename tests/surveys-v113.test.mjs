import fs from 'node:fs';
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const css=fs.readFileSync(new URL('../src/styles.css',import.meta.url),'utf8');
const checks=[
  ['single/multi/triple labels', /Single split · 1 binnenunit/.test(app) && /Multi split · 2 binnenunits/.test(app) && /Triple split · 3 binnenunits/.test(app)],
  ['automatic unit count', /function surveyInstallUnitCount/.test(app) && /if\(systemType==='multi_split'\) return 2/.test(app) && /if\(systemType==='triple_split'\) return 3/.test(app)],
  ['brand and model lists reused', /BRAND_OPTIONS/.test(app) && /MODEL_OPTIONS/.test(app) && /Model \/ serie/.test(app)],
  ['room dropdown', /SURVEY_ROOM_OPTIONS/.test(app) && /unitRoom/.test(app)],
  ['capacity per unit dropdown', /SURVEY_CAPACITY_OPTIONS/.test(app) && /unitCapacity/.test(app) && /kW/.test(app)],
  ['structured units saved', /const units=Array\.from/.test(app) && /unitCount:count/.test(app)],
  ['unit cards styled', /survey-unit-card/.test(css) && /survey-auto-units/.test(css)]
];
let failed=false;
for(const [name,ok] of checks){ console.log(`${ok?'PASS':'FAIL'} ${name}`); if(!ok) failed=true; }
if(failed) process.exit(1);
