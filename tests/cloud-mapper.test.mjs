import assert from 'node:assert/strict';
import { cloudDataMappers } from '../src/data/cloud-repository.js';

assert.equal(cloudDataMappers.dateValue('2026-02-28'), '2026-02-28');
assert.equal(cloudDataMappers.dateValue('2026-02-30'), null);
assert.equal(cloudDataMappers.dateValue(''), null);

const localState = {
  company: 'KTS Klimaattechniek',
  settings: {
    companyName: 'KTS Klimaattechniek',
    contactName: 'Stephan',
    maintenancePrice: 149,
    leadDays: 60,
    defaultInterval: 12,
    whatsappTemplate: 'Hallo {naam}'
  },
  customers: [{
    id: 'customer-1', name: 'Jan de Vries', address: 'Dorpsstraat 1',
    postalCode: '1234 AB', city: 'Utrecht', phone: '0612345678',
    email: 'jan@example.nl', memo: 'Testklant'
  }],
  systems: [{
    id: 'installation-1', customerId: 'customer-1', type: 'airco',
    brand: 'Daikin', model: 'Emura', serial: 'ABC123', installedAt: '2026-01-31',
    interval: 12, lastService: null, serviceStatus: 'active', pausedUntil: null,
    statusNote: '', reminderCustomer: true, reminderCompany: true, doneCount: 1,
    contactStatus: 'contacted', lastContactAt: '2026-07-12', maintenancePrice: 159
  }],
  appointments: [{
    id: 'appointment-1', customerId: 'customer-1', systemId: 'installation-1',
    type: 'onderhoud', date: '2027-01-31', time: '09:00', note: 'Bellen'
  }]
};

const payload = cloudDataMappers.stateToPayload(localState);
assert.equal(payload.settings.company_name, 'KTS Klimaattechniek');
assert.equal(payload.customers[0].postal_code, '1234 AB');
assert.equal(payload.installations[0].customer_id, 'customer-1');
assert.equal(payload.installations[0].maintenance_price, 159);
assert.equal(payload.appointments[0].installation_id, 'installation-1');

const restored = cloudDataMappers.cloudRowsToState(
  {
    company_name: 'KTS Klimaattechniek', contact_name: 'Stephan',
    maintenance_price: '149.00', lead_days: 60, default_interval: 12,
    whatsapp_template: 'Hallo', updated_at: '2026-07-12T20:00:00Z'
  },
  [{
    id: 'customer-1', name: 'Jan de Vries', address: 'Dorpsstraat 1',
    postal_code: '1234 AB', city: 'Utrecht', phone: '0612345678',
    email: 'jan@example.nl', memo: 'Testklant'
  }],
  [{
    id: 'installation-1', customer_id: 'customer-1', type: 'airco',
    brand: 'Daikin', model: 'Emura', serial_number: 'ABC123', installed_at: '2026-01-31',
    maintenance_interval: 12, last_service_date: null, service_status: 'active',
    paused_until: null, status_note: '', reminder_customer: true, reminder_company: true,
    done_count: 1, contact_status: 'contacted', last_contact_at: '2026-07-12',
    maintenance_price: '159.00'
  }],
  [{
    id: 'appointment-1', customer_id: 'customer-1', installation_id: 'installation-1',
    type: 'onderhoud', appointment_date: '2027-01-31', appointment_time: '09:00', note: 'Bellen'
  }]
);

assert.equal(restored.settings.maintenancePrice, 149);
assert.equal(restored.customers[0].postalCode, '1234 AB');
assert.equal(restored.systems[0].serial, 'ABC123');
assert.equal(restored.appointments[0].systemId, 'installation-1');

console.log('Cloud mapper tests geslaagd.');
