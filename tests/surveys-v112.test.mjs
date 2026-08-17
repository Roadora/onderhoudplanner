import fs from 'node:fs';
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const service=fs.readFileSync(new URL('../src/surveys/survey-service.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/surveys_v112.sql',import.meta.url),'utf8');
const must=[
  ['dynamic form renderer',app.includes('dynamicSurveyFields')],
  ['new install fields',app.includes("indoorUnits") && app.includes("brandPreference") && app.includes("estimatedLineLengthM")],
  ['fault fields',app.includes("errorCode") && app.includes("measurements") && app.includes("suspectedCause")],
  ['details collection',app.includes('collectDynamicSurveyDetails')],
  ['v112 get rpc',service.includes("get_survey_v112")],
  ['v112 upsert rpc',service.includes("upsert_survey_v112")],
  ['jsonb persistence',sql.includes('details jsonb') && sql.includes('p_details jsonb')]
];
for(const [name,ok] of must){ if(!ok) throw new Error(`FAIL: ${name}`); }
console.log('OK surveys v0.11.2 dynamic forms');
