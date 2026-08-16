import { STORAGE_KEY } from '../config.js';
import { getAccountContext, getOrganizationId } from '../account-context.js';
import { getSupabaseClient } from '../lib/supabase.js';
import { localRepository, observeLocalWrites, migrateOrganizationCacheToCurrentUser } from './local-repository.js';

const DEFAULT_WHATSAPP = 'Hallo {naam}, volgens onze planning is het weer tijd voor onderhoud aan uw {systeem}. Zullen we een afspraak inplannen? Groet, {bedrijf}';
const SYNC_DELAY_MS = 650;

let cloudRevision = 0;
let pendingRaw = null;
let syncTimer = null;
let syncPromise = null;
let inFlightRaw = null;
let cloudReady = false;
let lastSyncError = null;
let checkingRemote = false;
let lastStatus = { state: 'loading', label: 'Cloud laden…' };
let removeWriteObserver = null;

function emitStatus(state, label, detail = '') {
  lastStatus = { state, label, detail, at: new Date().toISOString() };
  window.dispatchEvent(new CustomEvent('maintenance-cloud-status', { detail: lastStatus }));
  updateStatusElement();
}

function updateStatusElement() {
  const element = document.querySelector('#syncStatus');
  if (!element) return;
  element.dataset.state = lastStatus.state;
  element.title = `${lastStatus.detail || lastStatus.label} Klik om nu te synchroniseren.`;
  if (!element.dataset.cloudBound) {
    element.dataset.cloudBound = 'true';
    element.addEventListener('click', async () => {
      try {
        await flushCloudSync();
        if (pendingRaw === null) emitStatus('saved', 'Opgeslagen', `Cloudrevisie ${cloudRevision}`);
      } catch (error) {
        window.alert(`Synchroniseren lukt nog niet: ${error?.message || 'onbekende fout'}`);
      }
    });
  }
  const icons = {
    loading: '◌', pending: '•', syncing: '↻', saved: '✓', offline: '⌁', error: '!', conflict: '!'
  };
  element.innerHTML = `<span aria-hidden="true">${icons[lastStatus.state] || '•'}</span><span class="sync-status-label">${lastStatus.label}</span>`;
}

function safeJson(raw) {
  try {
    const value = JSON.parse(raw || 'null');
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}

function stringValue(value, fallback = '') {
  return value === null || value === undefined ? fallback : String(value);
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function dateValue(value) {
  const text = stringValue(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;
  return text;
}

function createEmptyState() {
  const account = getAccountContext();
  const companyName = account?.organization?.name || 'Onderhoudsbedrijf';
  const contactName = account?.profile?.full_name || '';
  return {
    company: companyName,
    settings: {
      companyName,
      contactName,
      maintenancePrice: 129,
      leadDays: 45,
      defaultInterval: 12,
      whatsappTemplate: DEFAULT_WHATSAPP
    },
    customers: [],
    systems: [],
    appointments: [],
    updatedAt: null
  };
}

function normalizeLocalState(rawState) {
  const fallback = createEmptyState();
  const state = rawState && typeof rawState === 'object' ? structuredClone(rawState) : fallback;
  state.customers = Array.isArray(state.customers) ? state.customers : [];
  state.systems = Array.isArray(state.systems) ? state.systems : [];
  state.appointments = Array.isArray(state.appointments) ? state.appointments : [];
  state.settings = { ...fallback.settings, ...(state.settings || {}) };
  state.company = state.settings.companyName || fallback.company;
  state.updatedAt = state.updatedAt || null;
  return state;
}

function hasMeaningfulLocalData(state) {
  return Boolean(
    state?.customers?.length ||
    state?.systems?.length ||
    state?.appointments?.length
  );
}

function stateToPayload(rawState) {
  const state = normalizeLocalState(rawState);
  const customerIds = new Set(state.customers.map(customer => stringValue(customer.id)).filter(Boolean));
  const installationIds = new Set(state.systems.map(system => stringValue(system.id)).filter(Boolean));

  return {
    settings: {
      company_name: stringValue(state.settings.companyName || state.company || 'Onderhoudsbedrijf'),
      contact_name: stringValue(state.settings.contactName),
      maintenance_price: Math.max(0, numberValue(state.settings.maintenancePrice, 129)),
      lead_days: Math.max(1, numberValue(state.settings.leadDays, 45)),
      default_interval: Math.max(1, numberValue(state.settings.defaultInterval, 12)),
      whatsapp_template: stringValue(state.settings.whatsappTemplate || DEFAULT_WHATSAPP)
    },
    customers: state.customers
      .map(customer => ({
        id: stringValue(customer.id),
        name: stringValue(customer.name),
        address: stringValue(customer.address),
        postal_code: stringValue(customer.postalCode),
        city: stringValue(customer.city),
        phone: stringValue(customer.phone),
        email: stringValue(customer.email),
        memo: stringValue(customer.memo)
      }))
      .filter(customer => customer.id),
    installations: state.systems
      .map(system => ({
        id: stringValue(system.id),
        customer_id: stringValue(system.customerId),
        type: system.type === 'warmtepomp' ? 'warmtepomp' : 'airco',
        brand: stringValue(system.brand),
        model: stringValue(system.model),
        serial_number: stringValue(system.serial),
        installed_at: dateValue(system.installedAt) || '',
        maintenance_interval: Math.max(0, numberValue(system.interval, 12)),
        last_service_date: dateValue(system.lastService) || '',
        service_status: ['active', 'paused', 'declined'].includes(system.serviceStatus) ? system.serviceStatus : 'active',
        paused_until: dateValue(system.pausedUntil) || '',
        status_note: stringValue(system.statusNote),
        reminder_customer: system.reminderCustomer !== false,
        reminder_company: system.reminderCompany !== false,
        done_count: Math.max(0, numberValue(system.doneCount, 0)),
        contact_status: ['not_contacted', 'contacted', 'responded', 'scheduled', 'completed'].includes(system.contactStatus)
          ? system.contactStatus
          : 'not_contacted',
        last_contact_at: dateValue(system.lastContactAt) || '',
        maintenance_price: system.maintenancePrice === null || system.maintenancePrice === undefined || system.maintenancePrice === ''
          ? null
          : Math.max(0, numberValue(system.maintenancePrice, 0))
      }))
      .filter(system => system.id && customerIds.has(system.customer_id)),
    appointments: state.appointments
      .map(appointment => ({
        id: stringValue(appointment.id),
        customer_id: customerIds.has(stringValue(appointment.customerId)) ? stringValue(appointment.customerId) : null,
        installation_id: installationIds.has(stringValue(appointment.systemId)) ? stringValue(appointment.systemId) : null,
        type: stringValue(appointment.type || 'onderhoud'),
        appointment_date: dateValue(appointment.date) || '',
        appointment_time: stringValue(appointment.time),
        note: stringValue(appointment.note)
      }))
      .filter(appointment => appointment.id && appointment.appointment_date)
  };
}

function cloudRowsToState(settings, customers, installations, appointments) {
  const account = getAccountContext();
  const companyName = settings?.company_name || account?.organization?.name || 'Onderhoudsbedrijf';
  return {
    company: companyName,
    settings: {
      companyName,
      contactName: settings?.contact_name || account?.profile?.full_name || '',
      maintenancePrice: numberValue(settings?.maintenance_price, 129),
      leadDays: numberValue(settings?.lead_days, 45),
      defaultInterval: numberValue(settings?.default_interval, 12),
      whatsappTemplate: settings?.whatsapp_template || DEFAULT_WHATSAPP
    },
    customers: (customers || []).map(customer => ({
      id: customer.id,
      name: customer.name || '',
      address: customer.address || '',
      postalCode: customer.postal_code || '',
      city: customer.city || '',
      phone: customer.phone || '',
      email: customer.email || '',
      memo: customer.memo || ''
    })),
    systems: (installations || []).map(system => ({
      id: system.id,
      customerId: system.customer_id,
      type: system.type || 'airco',
      brand: system.brand || '',
      model: system.model || '',
      serial: system.serial_number || '',
      installedAt: system.installed_at || null,
      interval: numberValue(system.maintenance_interval, 12),
      lastService: system.last_service_date || null,
      serviceStatus: system.service_status || 'active',
      pausedUntil: system.paused_until || null,
      statusNote: system.status_note || '',
      reminderCustomer: system.reminder_customer !== false,
      reminderCompany: system.reminder_company !== false,
      doneCount: numberValue(system.done_count, 0),
      contactStatus: system.contact_status || 'not_contacted',
      lastContactAt: system.last_contact_at || null,
      maintenancePrice: system.maintenance_price === null ? null : numberValue(system.maintenance_price, 0)
    })),
    appointments: (appointments || []).map(appointment => ({
      id: appointment.id,
      customerId: appointment.customer_id || '',
      systemId: appointment.installation_id || '',
      type: appointment.type || 'onderhoud',
      date: appointment.appointment_date,
      time: appointment.appointment_time || '',
      note: appointment.note || ''
    })),
    updatedAt: settings?.updated_at || null
  };
}

function enhanceCloudError(error) {
  const message = String(error?.message || 'Onbekende cloudfout');
  if (/relation .* does not exist|schema cache|get_organization_state|replace_organization_state/i.test(message)) {
    const setupError = new Error('De cloudtabellen ontbreken nog. Voer supabase/cloud_schema_v082.sql volledig uit in de Supabase SQL Editor.');
    setupError.code = 'CLOUD_SCHEMA_MISSING';
    setupError.cause = error;
    return setupError;
  }
  return error;
}

async function fetchCloudState() {
  const supabase = getSupabaseClient();
  const organizationId = getOrganizationId();
  if (!supabase || !organizationId) throw new Error('Bedrijfsomgeving ontbreekt.');

  const { data, error } = await supabase.rpc('get_organization_state', {
    p_organization_id: organizationId
  });
  if (error) throw enhanceCloudError(error);

  const settings = data?.settings || null;
  const customers = Array.isArray(data?.customers) ? data.customers : [];
  const installations = Array.isArray(data?.installations) ? data.installations : [];
  const appointments = Array.isArray(data?.appointments) ? data.appointments : [];

  return {
    state: cloudRowsToState(settings, customers, installations, appointments),
    revision: numberValue(settings?.data_revision, 0),
    hasSettings: Boolean(settings),
    hasRecords: Boolean(customers.length || installations.length || appointments.length),
    migratedFromLocalAt: settings?.migrated_from_local_at || null
  };
}

async function replaceCloudState(rawState, { migratedFromLocal = false } = {}) {
  const supabase = getSupabaseClient();
  const organizationId = getOrganizationId();
  if (!supabase || !organizationId) throw new Error('Bedrijfsomgeving ontbreekt.');

  const payload = stateToPayload(rawState);
  const { data, error } = await supabase.rpc('replace_organization_state', {
    p_organization_id: organizationId,
    p_expected_revision: cloudRevision,
    p_state: payload,
    p_migrated_from_local: Boolean(migratedFromLocal)
  });

  if (error) throw enhanceCloudError(error);
  cloudRevision = numberValue(data, cloudRevision + 1);
  return cloudRevision;
}

function saveLocalBackup(raw, suffix) {
  if (!raw) return;
  const key = `${STORAGE_KEY}_${suffix}`;
  localRepository.setItem(key, raw, { silent: true });
}

async function resolveConflict(raw, error) {
  const latestLocalRaw = localRepository.getItem(STORAGE_KEY) || pendingRaw || raw;
  saveLocalBackup(latestLocalRaw, `conflict_backup_${Date.now()}`);
  emitStatus('conflict', 'Conflict', 'Wijzigingen op een ander apparaat zijn nieuwer.');
  const cloud = await fetchCloudState();
  cloudRevision = cloud.revision;
  localRepository.setItem(STORAGE_KEY, JSON.stringify(cloud.state), { silent: true });
  window.alert('Deze bedrijfsgegevens zijn intussen op een ander apparaat gewijzigd. De nieuwste cloudversie wordt geladen. Je niet-opgeslagen lokale versie is als conflictback-up in deze browser bewaard.');
  window.location.reload();
  throw error;
}

async function runSyncLoop() {
  if (syncPromise) return syncPromise;
  syncPromise = (async () => {
    while (pendingRaw !== null) {
      if (!navigator.onLine) {
        lastSyncError = new Error('Geen internetverbinding; de wijziging wacht lokaal.');
        emitStatus('offline', 'Offline', 'Wijzigingen staan veilig op dit apparaat en worden later gesynchroniseerd.');
        break;
      }
      const raw = pendingRaw;
      pendingRaw = null;
      inFlightRaw = raw;
      const state = safeJson(raw);
      if (!state) {
        inFlightRaw = null;
        continue;
      }
      emitStatus('syncing', 'Opslaan…', 'Wijzigingen worden naar Supabase gestuurd.');
      try {
        await replaceCloudState(state);
        lastSyncError = null;
        localRepository.removeItem(`${STORAGE_KEY}_pending_cloud`, { silent: true });
        emitStatus('saved', 'Opgeslagen', `Cloudrevisie ${cloudRevision}`);
      } catch (error) {
        if (String(error?.message || '').includes('CLOUD_REVISION_CONFLICT') || String(error?.code || '') === '40001') {
          await resolveConflict(raw, error);
          return;
        }
        console.error('Cloudsynchronisatie mislukt', error);
        lastSyncError = error;
        if (pendingRaw === null) pendingRaw = raw;
        emitStatus('error', 'Niet gesynchroniseerd', error?.message || 'Cloudopslag mislukt.');
        break;
      } finally {
        inFlightRaw = null;
      }
    }
  })().finally(() => {
    syncPromise = null;
  });
  return syncPromise;
}

function queueRaw(raw) {
  if (!cloudReady || !raw) return;
  pendingRaw = raw;
  emitStatus(navigator.onLine ? 'pending' : 'offline', navigator.onLine ? 'Wachten…' : 'Offline', 'Lokale wijziging wacht op synchronisatie.');
  if (syncTimer) window.clearTimeout(syncTimer);
  syncTimer = window.setTimeout(() => {
    syncTimer = null;
    runSyncLoop();
  }, SYNC_DELAY_MS);
}

export async function flushCloudSync() {
  if (syncTimer) {
    window.clearTimeout(syncTimer);
    syncTimer = null;
  }
  await runSyncLoop();
  if (pendingRaw !== null && lastSyncError) throw lastSyncError;
}

export function getCloudStatus() {
  return { ...lastStatus, revision: cloudRevision, pending: pendingRaw !== null };
}



function recoveryBackups() {
  const organizationId = getOrganizationId();
  if (!organizationId) return [];
  const userId = getAccountContext()?.user?.id || '';
  const suffix = userId ? `::organization::${organizationId}::user::${userId}` : `::organization::${organizationId}`;
  const prefix = `${STORAGE_KEY}_`;
  const backups = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const storageKey = window.localStorage.key(index);
    if (!storageKey || !storageKey.startsWith(prefix) || !storageKey.endsWith(suffix)) continue;
    if (!/_(?:pre_cloud|conflict|before_cloud)_backup_/.test(storageKey)) continue;
    const raw = window.localStorage.getItem(storageKey);
    const state = safeJson(raw);
    if (!state) continue;
    const timestampMatch = storageKey.match(/_(\d{10,})::organization::/);
    const createdAt = timestampMatch ? new Date(Number(timestampMatch[1])) : null;
    backups.push({
      storageKey,
      raw,
      createdAt: createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt : null,
      customers: Array.isArray(state.customers) ? state.customers.length : 0,
      systems: Array.isArray(state.systems) ? state.systems.length : 0,
      appointments: Array.isArray(state.appointments) ? state.appointments.length : 0
    });
  }
  return backups.sort((a, b) => (b.createdAt?.getTime() || 0) - (a.createdAt?.getTime() || 0));
}

function downloadLatestRecoveryBackup() {
  const latest = recoveryBackups()[0];
  if (!latest) {
    window.alert('Er is geen lokale noodback-up gevonden.');
    return;
  }
  const date = latest.createdAt || new Date();
  const filename = `optero-noodbackup-${date.toISOString().slice(0, 19).replaceAll(':', '-')}.json`;
  const blob = new Blob([latest.raw], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function refreshFromCloudWhenNewer() {
  if (checkingRemote || !navigator.onLine || pendingRaw !== null || syncPromise) return;
  checkingRemote = true;
  try {
    const latest = await fetchCloudState();
    if (latest.revision > cloudRevision) {
      cloudRevision = latest.revision;
      localRepository.setItem(STORAGE_KEY, JSON.stringify(latest.state), { silent: true });
      window.alert('Er zijn nieuwere wijzigingen vanaf een ander apparaat. De actuele cloudgegevens worden geladen.');
      window.location.reload();
    }
  } catch (error) {
    console.warn('Controleren op nieuwere cloudgegevens mislukt', error);
  } finally {
    checkingRemote = false;
  }
}

export async function bootstrapCloudData() {
  emitStatus('loading', 'Cloud laden…', 'Bedrijfsgegevens worden opgehaald.');
  migrateOrganizationCacheToCurrentUser(STORAGE_KEY);

  const cloud = await fetchCloudState();
  cloudRevision = cloud.revision;
  const pendingRecoveryRaw = localRepository.getItem(`${STORAGE_KEY}_pending_cloud`);
  const localRaw = pendingRecoveryRaw || localRepository.getItem(STORAGE_KEY);
  const localState = normalizeLocalState(safeJson(localRaw));
  const localHasRecords = hasMeaningfulLocalData(localState);
  const cloudHasNoRecords = !cloud.hasRecords;
  const localMigrationStillOpen = !cloud.migratedFromLocalAt;

  let activeState;
  if (pendingRecoveryRaw) {
    // Dit is geen oude import maar een wijziging die tijdens het sluiten nog
    // niet bevestigd was. Toon die versie direct en probeer hem opnieuw.
    activeState = localState;
  } else if (cloudHasNoRecords && localHasRecords && localMigrationStillOpen) {
    saveLocalBackup(localRaw, `pre_cloud_backup_${Date.now()}`);
    const totals = `${localState.customers.length} klanten, ${localState.systems.length} installaties en ${localState.appointments.length} afspraken`;
    const migrate = window.confirm(`Cloudopslag is gereed. Wil je ${totals} uit deze browser nu veilig naar je bedrijfsaccount overzetten?`);
    if (migrate) {
      await replaceCloudState(localState, { migratedFromLocal: true });
      activeState = localState;
      window.alert('De bestaande gegevens zijn succesvol naar je beveiligde bedrijfsomgeving overgezet.');
    } else {
      activeState = createEmptyState();
      // Markeer de migratiekeuze ook bij afwijzen, zodat een oude lokale kopie
      // niet bij iedere volgende login opnieuw wordt aangeboden.
      await replaceCloudState(activeState, { migratedFromLocal: true });
      window.alert('De cloudomgeving is leeg gestart. De oude lokale gegevens zijn als browserback-up bewaard.');
    }
  } else if (!cloud.hasSettings) {
    activeState = localRaw ? localState : createEmptyState();
    await replaceCloudState(activeState, { migratedFromLocal: Boolean(localRaw) });
  } else {
    activeState = cloud.state;
  }

  localRepository.setItem(STORAGE_KEY, JSON.stringify(activeState), { silent: true });
  cloudReady = true;
  removeWriteObserver?.();
  removeWriteObserver = observeLocalWrites(({ key, value }) => {
    if (key === STORAGE_KEY && value) queueRaw(value);
  });

  window.addEventListener('online', () => {
    if (pendingRaw !== null) runSyncLoop();
    else emitStatus('saved', 'Online', `Cloudrevisie ${cloudRevision}`);
  });
  window.addEventListener('offline', () => {
    emitStatus('offline', 'Offline', 'Wijzigingen blijven lokaal beschikbaar.');
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshFromCloudWhenNewer();
  });
  window.addEventListener('beforeunload', () => {
    const unsyncedRaw = pendingRaw || inFlightRaw;
    if (unsyncedRaw) localRepository.setItem(`${STORAGE_KEY}_pending_cloud`, unsyncedRaw, { silent: true });
  });

  if (pendingRecoveryRaw) {
    queueRaw(pendingRecoveryRaw);
  } else {
    emitStatus('saved', 'Opgeslagen', `Cloudrevisie ${cloudRevision}`);
  }

  window.maintenanceCloud = Object.freeze({
    flush: flushCloudSync,
    getStatus: getCloudStatus,
    getRecoveryBackups: () => recoveryBackups().map(({ raw, ...backup }) => backup),
    downloadLatestRecoveryBackup,
    reload: async () => {
      const latest = await fetchCloudState();
      cloudRevision = latest.revision;
      localRepository.setItem(STORAGE_KEY, JSON.stringify(latest.state), { silent: true });
      window.location.reload();
    }
  });

  updateStatusElement();
  return activeState;
}



export async function bootstrapTechnicianData() {
  const supabase = getSupabaseClient();
  const account = getAccountContext();
  const organizationId = getOrganizationId();
  if (!supabase || !organizationId || account?.membership?.role !== 'technician') {
    throw new Error('Monteursomgeving ontbreekt.');
  }

  emitStatus('loading', 'Mijn werk laden…', 'Alleen jouw toegewezen werkzaamheden worden opgehaald.');
  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const untilDate = new Date(today);
  untilDate.setDate(untilDate.getDate() + 14);
  const until = untilDate.toISOString().slice(0, 10);
  const { data, error } = await supabase.rpc('get_my_assigned_work', {
    p_organization_id: organizationId,
    p_from: from,
    p_until: until
  });
  if (error) throw enhanceCloudError(error);

  const payload = data || {};
  const activeState = cloudRowsToState(
    null,
    payload.customers || [],
    payload.installations || [],
    payload.appointments || []
  );
  activeState.company = account?.organization?.name || 'Optero';
  activeState.settings.companyName = activeState.company;
  activeState.settings.contactName = account?.profile?.full_name || '';
  localRepository.setItem(STORAGE_KEY, JSON.stringify(activeState), { silent: true });
  cloudReady = false;
  removeWriteObserver?.();
  removeWriteObserver = null;
  emitStatus('saved', 'Mijn werk geladen', `${activeState.appointments.length} toegewezen opdracht(en)`);
  updateStatusElement();
  return activeState;
}

// Alleen voor geautomatiseerde buildcontroles; de app gebruikt deze mapping intern.
export const cloudDataMappers = Object.freeze({
  dateValue,
  stateToPayload,
  cloudRowsToState
});
