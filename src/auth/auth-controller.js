import {
  APP_VERSION,
  STORAGE_KEY,
  LEGACY_STORAGE_KEYS,
  authRedirectUrl,
  hasSupabaseConfig
} from '../config.js';
import { getSupabaseClient } from '../lib/supabase.js';
import {
  ensureAccountWorkspace,
  updateOrganizationName,
  updateProfileName
} from './account-service.js';
import {
  getAccountContext,
  setAccountContext
} from '../account-context.js';
import { claimLegacyLocalData, localRepository } from '../data/local-repository.js';
import {
  clearActivationUrl,
  completeTeamInvitation,
  getActivationToken,
  hasEmployeeActivation
} from '../team/team-service.js';

const authRoot = document.querySelector('#authRoot');
const appShell = document.querySelector('#appShell');

let activeUserId = '';
let enteringAccount = false;
let lastRegistrationEmail = '';
let recoveryMode = new URL(window.location.href).searchParams.get('auth') === 'recovery';
let invitationMode = false;
let authenticatedHandler = null;

function esc(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setAppVisible(visible) {
  if (appShell) appShell.hidden = !visible;
  if (authRoot) authRoot.hidden = visible;
  document.body.classList.toggle('auth-active', !visible);
}

function shell(content, { compact = false } = {}) {
  setAppVisible(false);
  authRoot.innerHTML = `
    <main class="auth-page">
      <section class="auth-panel ${compact ? 'auth-panel-compact' : ''}">
        <div class="auth-brand">
          <img src="/icon-192.png" alt="" width="54" height="54">
          <div>
            <p class="eyebrow">Optero</p>
            <h1>Van opdracht naar uitvoering</h1>
          </div>
        </div>
        ${content}
        <p class="auth-version">${esc(APP_VERSION)}</p>
      </section>
    </main>`;
}

function messageBox(message, type = 'info') {
  if (!message) return '';
  return `<div class="auth-message ${type}">${esc(message)}</div>`;
}

function showLoading(message = 'Bedrijfsomgeving laden…') {
  shell(`
    <div class="auth-loading" role="status">
      <span class="spinner" aria-hidden="true"></span>
      <h2>${esc(message)}</h2>
      <p>Je account en bedrijfsomgeving worden beveiligd klaargezet.</p>
    </div>`, { compact: true });
}

function showMissingConfiguration() {
  shell(`
    <div class="auth-heading">
      <span class="auth-kicker">Eenmalige installatie nodig</span>
      <h2>Supabase is nog niet gekoppeld</h2>
      <p>Voeg de twee publieke Supabase-waarden toe aan <code>.env.local</code> en voer daarna het meegeleverde databasescript uit.</p>
    </div>
    <ol class="setup-steps">
      <li>Maak een nieuw Supabase-project aan.</li>
      <li>Voer <code>supabase/schema.sql</code> uit in de SQL Editor.</li>
      <li>Kopieer <code>.env.example</code> naar <code>.env.local</code>.</li>
      <li>Vul de Project URL en Publishable key in en herstart <code>npm run dev</code>.</li>
    </ol>
    <div class="auth-message info">Geheime service- of databasekeys horen nooit in de frontend.</div>
  `);
}

function showLogin(message = '', messageType = 'info') {
  shell(`
    <div class="auth-heading">
      <span class="auth-kicker">Bedrijfsaccount</span>
      <h2>Inloggen</h2>
      <p>Open je beveiligde Optero-werkomgeving.</p>
    </div>
    ${messageBox(message, messageType)}
    <form class="auth-form" id="loginForm">
      <label>E-mailadres<input name="email" type="email" autocomplete="email" required></label>
      <label>Wachtwoord<input name="password" type="password" autocomplete="current-password" required></label>
      <button class="primary" type="submit">Inloggen</button>
    </form>
    <button class="auth-link" id="forgotPasswordBtn" type="button">Wachtwoord vergeten?</button>
    <div class="auth-divider"><span>Nieuw bij Optero?</span></div>
    <button class="secondary full-width" id="openRegisterBtn" type="button">Bedrijfsaccount aanmaken</button>
  `);

  const form = document.querySelector('#loginForm');
  document.querySelector('#openRegisterBtn').onclick = () => showRegister();
  document.querySelector('#forgotPasswordBtn').onclick = () => showForgotPassword();
  form.onsubmit = async event => {
    event.preventDefault();
    setFormBusy(form, true, 'Inloggen…');
    const values = new FormData(form);
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: String(values.get('email') || '').trim(),
      password: String(values.get('password') || '')
    });
    if (error) {
      setFormBusy(form, false);
      showLogin(authErrorMessage(error), 'error');
    }
  };
}

function showRegister(message = '', messageType = 'info', preset = {}) {
  shell(`
    <div class="auth-heading">
      <span class="auth-kicker">Nieuw bedrijfsaccount</span>
      <h2>Account aanmaken</h2>
      <p>Na e-mailbevestiging wordt automatisch je eigen bedrijfsomgeving aangemaakt.</p>
    </div>
    ${messageBox(message, messageType)}
    <form class="auth-form" id="registerForm">
      <label>Bedrijfsnaam<input name="companyName" autocomplete="organization" maxlength="120" value="${esc(preset.companyName || '')}" required></label>
      <label>Jouw naam<input name="contactName" autocomplete="name" maxlength="100" value="${esc(preset.contactName || '')}" required></label>
      <label>E-mailadres<input name="email" type="email" autocomplete="email" value="${esc(preset.email || '')}" required></label>
      <label>Wachtwoord<input name="password" type="password" autocomplete="new-password" minlength="10" required><small>Minimaal 10 tekens.</small></label>
      <label>Herhaal wachtwoord<input name="passwordConfirm" type="password" autocomplete="new-password" minlength="10" required></label>
      <button class="primary" type="submit">Account aanmaken</button>
    </form>
    <button class="auth-link" id="backToLoginBtn" type="button">← Terug naar inloggen</button>
  `);

  const form = document.querySelector('#registerForm');
  document.querySelector('#backToLoginBtn').onclick = () => showLogin();
  form.onsubmit = async event => {
    event.preventDefault();
    const values = new FormData(form);
    const companyName = String(values.get('companyName') || '').trim();
    const contactName = String(values.get('contactName') || '').trim();
    const email = String(values.get('email') || '').trim().toLowerCase();
    const password = String(values.get('password') || '');
    const passwordConfirm = String(values.get('passwordConfirm') || '');

    if (password !== passwordConfirm) {
      showRegister('De twee wachtwoorden zijn niet gelijk.', 'error', { companyName, contactName, email });
      return;
    }

    setFormBusy(form, true, 'Account aanmaken…');
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: authRedirectUrl('confirmed'),
        data: {
          company_name: companyName,
          contact_name: contactName
        }
      }
    });

    if (error) {
      setFormBusy(form, false);
      showRegister(authErrorMessage(error), 'error', { companyName, contactName, email });
      return;
    }

    lastRegistrationEmail = email;
    if (data.session) {
      await enterAccount(data.session);
    } else {
      showEmailConfirmation(email);
    }
  };
}

function showEmailConfirmation(email, message = '') {
  shell(`
    <div class="auth-success-icon">✉</div>
    <div class="auth-heading centered">
      <span class="auth-kicker">E-mailbevestiging vereist</span>
      <h2>Controleer je inbox</h2>
      <p>We hebben een bevestigingslink gestuurd naar <strong>${esc(email)}</strong>. Na bevestiging kom je terug in Optero.</p>
    </div>
    ${messageBox(message, message ? 'success' : 'info')}
    <button class="primary" id="resendConfirmationBtn" type="button">Bevestigingsmail opnieuw sturen</button>
    <button class="auth-link" id="confirmationBackBtn" type="button">Ander e-mailadres gebruiken</button>
  `, { compact: true });

  document.querySelector('#confirmationBackBtn').onclick = () => showRegister('', 'info', { email });
  document.querySelector('#resendConfirmationBtn').onclick = async event => {
    event.currentTarget.disabled = true;
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: authRedirectUrl('confirmed') }
    });
    if (error) showEmailConfirmation(email, authErrorMessage(error));
    else showEmailConfirmation(email, 'De bevestigingsmail is opnieuw verstuurd.');
  };
}

function showForgotPassword(message = '', messageType = 'info', presetEmail = '') {
  shell(`
    <div class="auth-heading">
      <span class="auth-kicker">Account herstellen</span>
      <h2>Wachtwoord vergeten</h2>
      <p>Je ontvangt een beveiligde link waarmee je een nieuw wachtwoord kunt instellen.</p>
    </div>
    ${messageBox(message, messageType)}
    <form class="auth-form" id="forgotPasswordForm">
      <label>E-mailadres<input name="email" type="email" autocomplete="email" value="${esc(presetEmail)}" required></label>
      <button class="primary" type="submit">Herstellink versturen</button>
    </form>
    <button class="auth-link" id="forgotBackBtn" type="button">← Terug naar inloggen</button>
  `, { compact: true });

  const form = document.querySelector('#forgotPasswordForm');
  document.querySelector('#forgotBackBtn').onclick = () => showLogin();
  form.onsubmit = async event => {
    event.preventDefault();
    const email = String(new FormData(form).get('email') || '').trim().toLowerCase();
    setFormBusy(form, true, 'Versturen…');
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: authRedirectUrl('recovery')
    });
    if (error) showForgotPassword(authErrorMessage(error), 'error', email);
    else showForgotPassword('De herstellink is verstuurd. Controleer ook je map met ongewenste e-mail.', 'success', email);
  };
}

function showInvitationActivation(session, message = '', messageType = 'info') {
  invitationMode = true;
  const email = session?.user?.email || '';
  const suggestedName = session?.user?.user_metadata?.contact_name || email.split('@')[0] || '';
  shell(`
    <div class="auth-heading">
      <span class="auth-kicker">Medewerkersaccount</span>
      <h2>Activeer je account</h2>
      <p>Stel je naam en wachtwoord in. Daarna word je gekoppeld aan het bedrijf dat je heeft uitgenodigd.</p>
    </div>
    ${messageBox(message, messageType)}
    <form class="auth-form" id="invitationActivationForm">
      <label>E-mailadres<input value="${esc(email)}" type="email" disabled></label>
      <label>Jouw naam<input name="contactName" autocomplete="name" maxlength="100" value="${esc(suggestedName)}" required></label>
      <label>Nieuw wachtwoord<input name="password" type="password" autocomplete="new-password" minlength="10" required><small>Minimaal 10 tekens.</small></label>
      <label>Herhaal wachtwoord<input name="passwordConfirm" type="password" autocomplete="new-password" minlength="10" required></label>
      <button class="primary" type="submit">Account activeren</button>
    </form>
  `, { compact: true });

  const form = document.querySelector('#invitationActivationForm');
  form.onsubmit = async event => {
    event.preventDefault();
    const values = new FormData(form);
    const contactName = String(values.get('contactName') || '').trim();
    const password = String(values.get('password') || '');
    const passwordConfirm = String(values.get('passwordConfirm') || '');
    const activationToken = getActivationToken();

    if (password !== passwordConfirm) {
      showInvitationActivation(session, 'De twee wachtwoorden zijn niet gelijk.', 'error');
      return;
    }
    if (!activationToken) {
      showInvitationActivation(session, 'De activatielink is ongeldig of incompleet. Vraag de eigenaar om een nieuwe uitnodiging.', 'error');
      return;
    }

    setFormBusy(form, true, 'Account activeren…');
    const supabase = getSupabaseClient();
    try {
      const { error: passwordError } = await supabase.auth.updateUser({ password, data: { contact_name: contactName } });
      if (passwordError) throw passwordError;
      await completeTeamInvitation(activationToken, contactName);
      clearActivationUrl();
      invitationMode = false;
      activeUserId = '';
      const { data: { session: refreshedSession }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !refreshedSession) throw sessionError || new Error('De nieuwe sessie kon niet worden geladen.');
      await enterAccount(refreshedSession, 'Je medewerkersaccount is geactiveerd.');
    } catch (error) {
      console.error('Medewerkersaccount activeren mislukt', error);
      showInvitationActivation(session, authErrorMessage(error), 'error');
    }
  };
}

function showUpdatePassword(message = '', messageType = 'info') {
  recoveryMode = true;
  shell(`
    <div class="auth-heading">
      <span class="auth-kicker">Nieuw wachtwoord</span>
      <h2>Stel je wachtwoord opnieuw in</h2>
      <p>Kies een nieuw wachtwoord van minimaal 10 tekens.</p>
    </div>
    ${messageBox(message, messageType)}
    <form class="auth-form" id="updatePasswordForm">
      <label>Nieuw wachtwoord<input name="password" type="password" autocomplete="new-password" minlength="10" required></label>
      <label>Herhaal nieuw wachtwoord<input name="passwordConfirm" type="password" autocomplete="new-password" minlength="10" required></label>
      <button class="primary" type="submit">Wachtwoord opslaan</button>
    </form>
  `, { compact: true });

  const form = document.querySelector('#updatePasswordForm');
  form.onsubmit = async event => {
    event.preventDefault();
    const values = new FormData(form);
    const password = String(values.get('password') || '');
    const passwordConfirm = String(values.get('passwordConfirm') || '');
    if (password !== passwordConfirm) {
      showUpdatePassword('De twee wachtwoorden zijn niet gelijk.', 'error');
      return;
    }
    setFormBusy(form, true, 'Opslaan…');
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      showUpdatePassword(authErrorMessage(error), 'error');
      return;
    }
    recoveryMode = false;
    clearAuthParameters();
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await enterAccount(session, 'Je nieuwe wachtwoord is opgeslagen.');
    else showLogin('Je nieuwe wachtwoord is opgeslagen. Log opnieuw in.', 'success');
  };
}

function showAccountSetupError(error) {
  shell(`
    <div class="auth-heading">
      <span class="auth-kicker">Account is bevestigd</span>
      <h2>Bedrijfsomgeving kan nog niet worden geopend</h2>
      <p>${esc(error?.message || 'Er is een fout opgetreden bij het aanmaken van de bedrijfsomgeving.')}</p>
    </div>
    <div class="auth-message error">Controleer of <code>supabase/schema.sql</code> én <code>supabase/cloud_schema_v082.sql</code> volledig zijn uitgevoerd en vernieuw daarna de pagina.</div>
    <button class="primary" id="retryWorkspaceBtn" type="button">Opnieuw proberen</button>
    <button class="auth-link" id="workspaceLogoutBtn" type="button">Uitloggen</button>
  `, { compact: true });
  document.querySelector('#retryWorkspaceBtn').onclick = () => window.location.reload();
  document.querySelector('#workspaceLogoutBtn').onclick = () => signOut();
}

async function enterAccount(session, successMessage = '') {
  if (!session?.user || enteringAccount || activeUserId === session.user.id) return;
  enteringAccount = true;
  showLoading();
  try {
    if (hasEmployeeActivation()) {
      showInvitationActivation(session);
      return;
    }
    const context = await ensureAccountWorkspace(session.user);
    setAccountContext(context);
    exposeAccountApi();
    maybeClaimLegacyData(context.organization.name);
    if (typeof authenticatedHandler === 'function') {
      showLoading('Cloudgegevens laden…');
      await authenticatedHandler(context);
    }
    activeUserId = session.user.id;
    clearAuthParameters();
    setAppVisible(true);
    if (successMessage) window.setTimeout(() => alert(successMessage), 300);
  } catch (error) {
    console.error('Bedrijfsomgeving laden mislukt', error);
    showAccountSetupError(error);
  } finally {
    enteringAccount = false;
  }
}

function maybeClaimLegacyData(companyName) {
  if (localRepository.hasScopedItem(STORAGE_KEY)) return;
  const sourceKey = [STORAGE_KEY, ...LEGACY_STORAGE_KEYS].find(
    key => localRepository.getUnscopedItem(key)
  );
  if (!sourceKey) return;

  const claimKey = `${STORAGE_KEY}::legacy_claimed_by`;
  const claimedBy = localRepository.getUnscopedItem(claimKey);
  const organizationId = getAccountContext()?.organization?.id;
  if (claimedBy && claimedBy !== organizationId) return;

  const useExisting = window.confirm(
    `Er staan bestaande Optero-gegevens in deze browser. Wil je deze koppelen aan het bedrijfsaccount “${companyName}”?`
  );
  if (useExisting) claimLegacyLocalData(STORAGE_KEY, LEGACY_STORAGE_KEYS);
}

function exposeAccountApi() {
  const role = getAccountContext()?.membership?.role || '';
  const api = { getContext: getAccountContext, signOut, updateProfileName };
  if (role === 'owner') api.updateOrganizationName = updateOrganizationName;
  window.maintenanceAccount = Object.freeze(api);
}

async function signOut() {
  const supabase = getSupabaseClient();
  try {
    await window.maintenanceCloud?.flush?.();
  } catch (error) {
    console.warn('Laatste cloudsynchronisatie voor uitloggen mislukt', error);
  }
  activeUserId = '';
  setAccountContext(null);
  await supabase?.auth.signOut();
  window.location.reload();
}

function setFormBusy(form, busy, label = '') {
  const button = form?.querySelector('button[type="submit"]');
  if (!button) return;
  if (!button.dataset.defaultLabel) button.dataset.defaultLabel = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? label : button.dataset.defaultLabel;
}

function authErrorMessage(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return 'Het e-mailadres of wachtwoord is niet juist.';
  }
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) {
    return 'Bevestig eerst je e-mailadres via de link in je inbox.';
  }
  if (code === 'user_already_exists' || /already registered|already exists/i.test(message)) {
    return 'Voor dit e-mailadres bestaat al een account. Probeer in te loggen.';
  }
  if (code === 'weak_password' || /password/i.test(message) && /least|weak/i.test(message)) {
    return 'Kies een sterker wachtwoord van minimaal 10 tekens.';
  }
  if (code === 'over_email_send_rate_limit' || /rate limit/i.test(message)) {
    return 'Er zijn te veel e-mails kort na elkaar aangevraagd. Probeer het later opnieuw.';
  }
  if (/failed to fetch|network/i.test(message)) {
    return 'Geen verbinding met de accountserver. Controleer je internetverbinding en Supabase-instellingen.';
  }
  return message || 'De accountactie is mislukt. Probeer het opnieuw.';
}

function clearAuthParameters() {
  const url = new URL(window.location.href);
  ['auth', 'code', 'error', 'error_code', 'error_description', 'type', 'token_hash'].forEach(key => {
    url.searchParams.delete(key);
  });
  window.history.replaceState({}, document.title, `${url.pathname}${url.search}${url.hash && !url.hash.includes('access_token') ? url.hash : ''}`);
}

function initialCallbackError() {
  const url = new URL(window.location.href);
  return url.searchParams.get('error_description') || url.searchParams.get('error');
}

export async function bootstrapAuth({ onAuthenticated } = {}) {
  if (!authRoot || !appShell) throw new Error('Accountcontainers ontbreken in index.html.');
  setAppVisible(false);

  if (!hasSupabaseConfig()) {
    showMissingConfiguration();
    return;
  }

  const supabase = getSupabaseClient();
  const callbackError = initialCallbackError();
  if (callbackError) {
    showLogin(decodeURIComponent(callbackError.replaceAll('+', ' ')), 'error');
  } else {
    showLoading('Account controleren…');
  }

  authenticatedHandler = typeof onAuthenticated === 'function' ? onAuthenticated : null;

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      if (session && hasEmployeeActivation()) showInvitationActivation(session);
      else showUpdatePassword();
      return;
    }
    if (event === 'SIGNED_OUT') {
      invitationMode = false;
      if (!recoveryMode) showLogin();
      return;
    }
    if (session && !recoveryMode && ['SIGNED_IN', 'INITIAL_SESSION', 'TOKEN_REFRESHED'].includes(event)) {
      if (hasEmployeeActivation()) {
        window.setTimeout(() => showInvitationActivation(session), 0);
      } else {
        window.setTimeout(() => enterAccount(session), 0);
      }
    }
  });

  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    showLogin(authErrorMessage(error), 'error');
    return;
  }

  if (session && hasEmployeeActivation()) {
    showInvitationActivation(session);
  } else if (recoveryMode && session) {
    showUpdatePassword();
  } else if (session) {
    await enterAccount(session);
  } else if (!callbackError && hasEmployeeActivation()) {
    shell(`<div class="auth-heading"><span class="auth-kicker">Activatielink</span><h2>Activatie kon niet worden gestart</h2><p>De beveiligde sessie ontbreekt. Vraag de eigenaar om een nieuwe uitnodiging en open de nieuwste e-mail.</p></div>`, { compact: true });
  } else if (!callbackError) {
    showLogin();
  }
}
