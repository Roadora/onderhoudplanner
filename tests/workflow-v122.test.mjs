import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const sql=fs.readFileSync(new URL('../supabase/quotes_workorders_v122.sql',import.meta.url),'utf8');
const quoteService=fs.readFileSync(new URL('../src/quotes/quote-service.js',import.meta.url),'utf8');
const workorderService=fs.readFileSync(new URL('../src/workorders/workorder-service.js',import.meta.url),'utf8');

assert.match(app,/quote:'Offerte'/);
assert.match(app,/workOrders:'Werkorders'/);
assert.match(app,/Werkorder inplannen/);
assert.match(app,/linkWorkOrderAppointment\(routedWorkOrder\.id,savedAppointmentId\)/);
assert.match(app,/workOrderExecutePage/);
assert.match(app,/extraRefrigerantG/);
assert.match(app,/extraLineM/);
assert.match(app,/EXTRA WERKZAAMHEDEN/);
assert.match(app,/owner: new Set\([^\n]*'quote'/);
assert.doesNotMatch(app,/technician: new Set\([^\n]*'quote'/);
assert.doesNotMatch(app,/planner: new Set\([^\n]*'quote'/);

assert.match(quoteService,/membership\?\.role!=='owner'/);
assert.match(sql,/public\.is_organization_owner\(p_organization_id\)/);
assert.match(sql,/status in \('draft','sent','accepted','rejected'\)/);
assert.match(sql,/status in \('concept','ready','scheduled','in_progress','completed','cancelled'\)/);
assert.match(sql,/work_order_is_assigned_to_me_v122/);
assert.match(sql,/Whitelist uitsluitend technische uitvoeringsvelden/);
assert.match(sql,/jsonb_build_object\(\s*'actualLineLengthM'/s);
assert.match(workorderService,/update_work_order_execution_v122/);

console.log('v0.12.2 offerte-werkorder-uitvoering workflow checks: OK');
