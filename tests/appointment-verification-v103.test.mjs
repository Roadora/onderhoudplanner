import assert from 'node:assert/strict';
import fs from 'node:fs';

const repo = fs.readFileSync(new URL('../src/data/cloud-repository.js', import.meta.url), 'utf8');
const sql = fs.readFileSync(new URL('../supabase/appointment_verification_v103.sql', import.meta.url), 'utf8');

assert.match(repo, /rpc\('verify_appointment_persisted_v103'/, 'Afspraakverificatie moet via de beveiligde RPC lopen.');
assert.doesNotMatch(repo, /\.from\('appointments'\)[\s\S]{0,180}\.select\('id,appointment_date,appointment_time,updated_at'/, 'De v0.10.2 directe verificatiequery mag niet terugkomen.');
assert.match(sql, /security definer/i, 'De verificatie-RPC moet security definer zijn.');
assert.match(sql, /has_organization_role[\s\S]*owner[\s\S]*planner/i, 'Alleen eigenaar/planner mag de afspraak verifiëren.');
assert.match(sql, /revoke all on public\.appointments from authenticated/i, 'appointments moet rechtstreeks gesloten blijven.');
console.log('v0.10.3 appointment verification audit: OK');
