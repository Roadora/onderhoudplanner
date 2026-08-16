import fs from 'node:fs';
import assert from 'node:assert/strict';

const cloud = fs.readFileSync(new URL('../src/data/cloud-repository.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const auth = fs.readFileSync(new URL('../src/auth/auth-controller.js', import.meta.url), 'utf8');
const sql = fs.readFileSync(new URL('../supabase/transactional_cloud_v100.sql', import.meta.url), 'utf8');

assert.match(cloud, /merge_organization_state_v100/);
assert.doesNotMatch(cloud, /rpc\('replace_organization_state'/);
assert.match(cloud, /delete_appointments_v100/);
assert.match(cloud, /delete_installation_v100/);
assert.match(cloud, /delete_customer_v100/);
assert.match(app, /deleteCloudAppointments/);
assert.match(app, /deleteCloudInstallation/);
assert.match(app, /deleteCloudCustomer/);
assert.doesNotMatch(auth, /maybeClaimLegacyData/);
assert.match(sql, /create or replace function public\.merge_organization_state_v100/);
const mergeStart = sql.indexOf('create or replace function public.merge_organization_state_v100');
const mergeEnd = sql.indexOf('create or replace function public.delete_appointments_v100');
const mergeBody = sql.slice(mergeStart, mergeEnd);
assert.doesNotMatch(mergeBody, /delete from public\.appointments/);
assert.doesNotMatch(mergeBody, /delete from public\.installations/);
assert.doesNotMatch(mergeBody, /delete from public\.customers/);
console.log('transactional cloud v0.10.0 audit: OK');
