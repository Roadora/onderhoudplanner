export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js', { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch((error) => console.warn('Service worker niet actief', error));
  });
}
