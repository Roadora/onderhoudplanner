import './styles.css';
import { registerServiceWorker } from './pwa.js';
import { bootstrapAuth } from './auth/auth-controller.js';
import { bootstrapCloudData, bootstrapTechnicianData } from './data/cloud-repository.js';

registerServiceWorker();

bootstrapAuth({
  onAuthenticated: async (context) => {
    if (context?.membership?.role === 'technician') await bootstrapTechnicianData();
    else await bootstrapCloudData();
    await import('./app.js');
  }
}).catch(error => {
  console.error('Optero starten mislukt', error);
  document.querySelector('#authRoot').innerHTML = `
    <main class="auth-page"><section class="auth-panel auth-panel-compact">
      <h1>Optero kon niet starten</h1>
      <p>${String(error?.message || error)}</p>
    </section></main>`;
});
