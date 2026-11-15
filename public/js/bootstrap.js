async function loadJSON(path) {
  const response = await fetch(path, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${path} (${response.status})`);
  return response.json();
}

Promise.all([
  loadJSON('config/oeuvres.json'),
  loadJSON('config/translations/fr.json'),
  loadJSON('config/translations/en.json'),
])
  .then(([catalogue, fr, en]) => window.initNYF(catalogue, { fr, en }))
  .catch((error) => {
    console.error('Impossible de charger le catalogue NYF.', error);
    let english = false;
    try { english = localStorage.getItem('nyf-language') === 'en'; } catch (_) { /* French is the default. */ }
    const message = document.querySelector('[data-load-error]');
    message.textContent = english
      ? 'The catalogue could not be loaded. Please try again in a moment.'
      : 'Le catalogue ne peut pas être chargé. Veuillez réessayer dans un instant.';
    message.lang = english ? 'en' : 'fr';
    message.hidden = false;
  });
