import assert from 'node:assert/strict';
import fs from 'node:fs';

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const leadService=fs.readFileSync(new URL('../src/leads/lead-service.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/workflow_hardening_v131.sql',import.meta.url),'utf8');
const config=fs.readFileSync(new URL('../src/config.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../public/service-worker.js',import.meta.url),'utf8');
const pkg=JSON.parse(fs.readFileSync(new URL('../package.json',import.meta.url),'utf8'));

// Mailbox API regression: account én supabase moeten in scope zijn.
assert.match(leadService,/const \{account,supabase\}=context\(\['owner','planner'\]\)/);
assert.match(leadService,/x-optero-organization-id':account\.organization\.id/);

// Nieuwe klant uit aanvraag blijft Aandacht nodig totdat opname echt in cloud staat.
assert.match(app,/await updateLead\(lead\.id,'reviewing',cid\)/);
assert.match(app,/leadInboxCache=openLeads\.filter\(item=>\['new','reviewing'\]\.includes\(item\.status\)\)/);
assert.match(app,/persistAppointmentForm\(savedAppointmentId, f\)[\s\S]*await updateLead\(route\.leadId,route\.leadFinalStatus/);

// Afgeronde opname volgt nieuwe offerte/werkorderworkflow i.p.v. oude vervolgafspraak.
assert.match(app,/buildSurveyFollowUps\(surveys=\[\],workOrders=\[\]\)/);
assert.match(app,/startedSurveyIds\.has\(String\(survey\.appointment_id/);
assert.match(app,/Offerte nodig/);
assert.doesNotMatch(app,/Er staat na deze afgeronde opname nog geen vervolgafspraak bij de klant/);

// Alle complete systemen moeten door naar de werkorder.
assert.match(app,/const systems=Array\.from\(\{length:count\}/);
assert.match(app,/d\.systems\.map\(workOrderSystemDetailCard\)/);
assert.match(app,/collectWorkOrderSystems\(f,d\.systems\|\|\[\]\)/);

// Opnamefoto's zijn vanuit de werkorder zichtbaar.
assert.match(app,/surveyPhotos=await listSurveyPhotos\(workOrder\.survey_appointment_id\)/);
assert.match(app,/OPNAMEFOTO'S/);
assert.match(sql,/wo\.survey_appointment_id=p_appointment_id/,'Monteur moet opnamefoto’s via toegewezen werkorder kunnen lezen');

// Commerciële velden mogen niet door werkorder-details lekken.
assert.match(sql,/safe_work_order_details_v131/);
assert.match(sql,/v_safe_details:=public\.safe_work_order_details_v131\(p_details\)/);
assert.match(sql,/public\.safe_work_order_details_v131\(w\.details\)/);
assert.doesNotMatch(sql,/jsonb_build_object\([\s\S]*'unitPrice'/);

assert.equal(pkg.version,'0.13.1');
assert.ok(config.includes(`APP_VERSION = '${pkg.version} `));
assert.ok(sw.includes(`CACHE_NAME = 'optero-v${pkg.version}'`));
console.log('workflow-audit-v131: ok');
