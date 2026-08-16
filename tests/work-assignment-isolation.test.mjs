import assert from 'node:assert/strict';
import fs from 'node:fs';

const local = fs.readFileSync(new URL('../src/data/local-repository.js', import.meta.url), 'utf8');
const cloud = fs.readFileSync(new URL('../src/data/cloud-repository.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const sql = fs.readFileSync(new URL('../supabase/work_assignment_isolation_v097.sql', import.meta.url), 'utf8');
const auth = fs.readFileSync(new URL('../src/auth/auth-controller.js', import.meta.url), 'utf8');

assert.match(local, /::organization::\$\{organizationId\}::user::\$\{userId\}/, 'cache moet per organisatie + gebruiker gescheiden zijn');
assert.match(auth, /clearCurrentUserLocalData\(\)/, 'uitloggen moet gebruikerscache wissen');
assert.match(cloud, /bootstrapTechnicianData/, 'monteur moet eigen cloudbootstrap hebben');
assert.match(cloud, /get_my_assigned_work/, 'monteurdata moet via gecontroleerde RPC komen');
assert.match(app, /setAppointmentAssignments/, 'afspraak moet medewerkers kunnen opslaan');
assert.match(app, /assignedUsers/, 'formulier moet één of meerdere medewerkers kunnen selecteren');
assert.match(sql, /create table if not exists public\.work_order_assignments/, 'assignmenttabel ontbreekt');
assert.match(sql, /user_id = auth\.uid\(\)/, 'monteurselectie moet aan auth.uid gekoppeld zijn');
assert.match(sql, /protect_company_settings_from_planner/, 'plannerinstellingen moeten server-side beschermd zijn');

console.log('work assignment & isolation checks: ok');
