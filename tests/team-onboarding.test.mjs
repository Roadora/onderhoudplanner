import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const invite = await readFile(new URL('api/invite-team-member.js', root), 'utf8');
const auth = await readFile(new URL('src/auth/auth-controller.js', root), 'utf8');
const client = await readFile(new URL('src/lib/supabase.js', root), 'utf8');
const schema = await readFile(new URL('supabase/team_onboarding_v095.sql', root), 'utf8');
const account = await readFile(new URL('src/auth/account-service.js', root), 'utf8');

assert.match(invite, /randomBytes\(32\)/);
assert.match(invite, /activation_token_hash/);
assert.match(invite, /employee_activation=/);
assert.match(client, /flowType:\s*'implicit'/);
assert.match(auth, /completeTeamInvitation/);
assert.match(auth, /hasEmployeeActivation/);
assert.match(schema, /complete_team_invitation/);
assert.match(schema, /extensions\.digest/);
assert.match(account, /invited_as_team_member/);
assert.doesNotMatch(auth, /acceptInvitationFromUrl/);
console.log('team-onboarding audit checks: ok');
