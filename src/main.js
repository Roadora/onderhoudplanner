import './styles.css';
import { registerServiceWorker } from './pwa.js';
import { bootstrapAuth } from './auth/auth-controller.js';
import { bootstrapCloudData } from './data/cloud-repository.js';

registerServiceWorker();

bootstrapAuth({
  onAuthenticated: async (context) => {
    // Monteurs krijgen in v0.9.0 nog geen volledige bedrijfsdataset.
    // Werkopdrachtfiltering wordt in de volgende stap toegevoegd.
    if (context?.membership?.role !== 'technician') await bootstrapCloudData();
    await import('./app.js');
  }
}).catch(error => {
  console.error('OnderhoudPlanner starten mislukt', error);
  document.querySelector('#authRoot').innerHTML = `
    <main class="auth-page"><section class="auth-panel auth-panel-compact">
      <h1>OnderhoudPlanner kon niet starten</h1>
      <p>${String(error?.message || error)}</p>
    </section></main>`;
});
