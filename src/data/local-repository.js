/**
 * Tijdelijke lokale repository voor stap 1.
 * De interface is bewust klein gehouden, zodat deze in stap 2 vervangen kan
 * worden door een Supabase-repository zonder de schermen opnieuw te bouwen.
 */
export const localRepository = Object.freeze({
  getItem(key) {
    return window.localStorage.getItem(key);
  },

  setItem(key, value) {
    window.localStorage.setItem(key, value);
  },

  removeItem(key) {
    window.localStorage.removeItem(key);
  }
});
