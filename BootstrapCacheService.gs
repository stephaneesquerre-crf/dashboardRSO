// Cache du chargement (22/10/2026). Mesure sur les vraies données avant
// cache : 6,5 s côté serveur, dont 3,5 s de vérification des accès, à
// chaque ouverture et pour chaque personne. Désormais :
// - les données calculées (getDashboardBootstrap) sont gardées
//   BOOTSTRAP_CACHE_SECONDS_ dans le cache du script, commun à toutes les
//   personnes ;
// - le contrôle des droits reste fait pour chaque personne, et son résultat
//   est gardé ACCESS_CACHE_SECONDS_ dans le cache de cette personne ;
// - une personne sans accès aux archives ou aux référents ne reçoit pas
//   ces données depuis le cache (personalizeCachedBootstrap_).
// Le bouton « Actualiser les données » de la page relit tout
// (forceRefresh). Une valeur du cache Apps Script est limitée à 100 Ko :
// les données sont compressées puis découpées en morceaux.

const BOOTSTRAP_CACHE_SECONDS_ = 600;
const ACCESS_CACHE_SECONDS_ = 1800;
// À changer si la forme des données envoyées à la page change (nouveau
// champ…) : l'ancien cache est alors ignoré dès le déploiement.
const BOOTSTRAP_CACHE_KEY_ = 'dashboard-bootstrap-v1';
const ACCESS_CACHE_KEY_ = 'dashboard-access-v1';
const CACHE_CHUNK_CHARS_ = 90000;

function readBootstrapCache_() {
  try {
    const cache = CacheService.getScriptCache();
    const meta = cache.get(`${BOOTSTRAP_CACHE_KEY_}|meta`);
    if (!meta) return null;
    const {chunks} = JSON.parse(meta);
    const keys = Array.from({length: chunks}, (unused, index) => `${BOOTSTRAP_CACHE_KEY_}|${index}`);
    const parts = cache.getAll(keys);
    if (keys.some((key) => !parts[key])) return null;
    const gzipped = Utilities.newBlob(Utilities.base64Decode(keys.map((key) => parts[key]).join('')), 'application/x-gzip');
    return JSON.parse(Utilities.ungzip(gzipped).getDataAsString());
  } catch (error) {
    console.warn(`Cache du dashboard illisible (${error.message}) : lecture des classeurs.`);
    return null;
  }
}

function writeBootstrapCache_(bootstrap) {
  try {
    const json = JSON.stringify(Object.assign({}, bootstrap, {diagnostics: Object.assign({}, bootstrap.diagnostics, {timings: []})}));
    const encoded = Utilities.base64Encode(Utilities.gzip(Utilities.newBlob(json, 'application/json')).getBytes());
    const entries = {};
    let chunks = 0;
    for (let start = 0; start < encoded.length; start += CACHE_CHUNK_CHARS_) {
      entries[`${BOOTSTRAP_CACHE_KEY_}|${chunks}`] = encoded.slice(start, start + CACHE_CHUNK_CHARS_);
      chunks += 1;
    }
    // Morceaux d'abord, description ensuite : une lecture concurrente ne
    // voit jamais une description sans ses morceaux.
    const cache = CacheService.getScriptCache();
    cache.putAll(entries, BOOTSTRAP_CACHE_SECONDS_);
    cache.put(`${BOOTSTRAP_CACHE_KEY_}|meta`, JSON.stringify({chunks: chunks, cachedAt: bootstrap.generatedAt}), BOOTSTRAP_CACHE_SECONDS_);
  } catch (error) {
    console.warn(`Cache du dashboard non écrit (${error.message}).`);
  }
}

// Vide le cache des données : après « Rafraîchir les archives » ou à
// lancer depuis l'éditeur après une correction dans un classeur.
function viderCacheDashboard() {
  CacheService.getScriptCache().remove(`${BOOTSTRAP_CACHE_KEY_}|meta`);
}

// Droits de la personne sur chaque classeur (checkSpreadsheetAccess_),
// gardés dans son cache personnel. forceRefresh : contrôle refait.
function getUserSpreadsheetAccess_(forceRefresh) {
  const cache = CacheService.getUserCache();
  if (!forceRefresh) {
    const cached = cache.get(ACCESS_CACHE_KEY_);
    if (cached) return JSON.parse(cached);
  }
  const access = checkSpreadsheetAccess_();
  // Un refus n'est pas gardé : l'accès accordé se voit au rechargement.
  if (access.every((item) => item.ok)) cache.put(ACCESS_CACHE_KEY_, JSON.stringify(access), ACCESS_CACHE_SECONDS_);
  return access;
}

// Données du cache adaptées à la personne : durées de ce chargement,
// classeurs inaccessibles signalés et leurs données retirées.
function personalizeCachedBootstrap_(bootstrap, missing) {
  const missingKeys = missing.map((item) => item.key);
  if (missingKeys.indexOf('archives') !== -1) bootstrap.history = {rows: []};
  if (missingKeys.indexOf('referents') !== -1) bootstrap.referents = {evolution: [], poles: [], sources: []};
  bootstrap.diagnostics.accessLinks = (bootstrap.diagnostics.accessLinks || []).concat(missing);
  bootstrap.diagnostics.timings = DASHBOARD_DIAGNOSTICS_.timings.slice();
  bootstrap.fromCache = true;
  return bootstrap;
}

// À lancer par un déclencheur horaire (facultatif, cf. README) : recharge
// le cache avant qu'il expire, pour que personne n'attende la lecture
// complète. Tourne avec les droits du compte qui crée le déclencheur.
function prechargerDashboard() {
  loadDashboardBootstrap_(true);
}
