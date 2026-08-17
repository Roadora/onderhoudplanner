import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const account = fs.readFileSync(new URL('../src/auth/account-service.js', import.meta.url), 'utf8');
const invite = fs.readFileSync(new URL('../api/invite-team-member.js', import.meta.url), 'utf8');
const sql = fs.readFileSync(new URL('../supabase/roles_mail_hardening_v096.sql', import.meta.url), 'utf8');

assert.match(app, /technician: new Set\(\['myDay','account','appointmentDetail','surveyDetail','surveyEdit','workOrderDetail','workOrderExecute'\]\)/, 'Monteur mag alleen zijn planning, account, afspraakdetails, toegewezen opnamedossier en toegewezen werkorder routen.');
assert.doesNotMatch(app, /technician: new Set\([^\n]*'quote'/, 'Monteur mag nooit de offerte- of prijsroute openen.');
assert.match(app, /if\(currentRole !== 'owner'\) return nav\(defaultRouteForRole\(\)\);/, 'Medewerkersbeheer moet eigenaar-only zijn.');
assert.match(app, /currentRole === 'owner'.*Bedrijfsinstellingen wijzigen/s, 'Bedrijfsinstellingenknop moet eigenaar-only zijn.');
assert.match(app, /syncStatusBtn\.hidden = true/, 'Cloudstatus moet bij monteurs verborgen zijn zolang zij geen bedrijfsdataset laden.');
assert.match(account, /\.eq\('status', 'active'\)/, 'Alleen actief lidmaatschap mag een accountomgeving openen.');
assert.match(invite, /delivery_status: 'mail_failed'/, 'Mislukte uitnodigingsmail moet expliciet worden geregistreerd.');
assert.match(invite, /delivery_status: 'sent'/, 'Succesvolle uitnodigingsmail moet expliciet worden geregistreerd.');
assert.match(sql, /has_organization_role\(p_organization_id, array\['owner','planner'\]/, 'Cloud-RPC moet eigenaar/planner server-side afdwingen.');
assert.match(sql, /team_invites_manage_owner/, 'Uitnodigings-RLS moet eigenaar-only zijn.');
assert.match(sql, /members_select_own_or_management/, 'Monteur mag via RLS niet alle teamleden uitlezen.');

console.log('role-hardening.test.mjs: OK');
