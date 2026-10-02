function cleanValue_(value) {
  return String(value == null ? '' : value).trim();
}

// Les en-têtes du classeur mélangent apostrophes typographiques (’) et
// droites ('), et notent parfois un même champ avec un underscore ou un
// espace (« code_pôle » / « Code pôle »). On neutralise ces variations avant
// comparaison pour ne pas dépendre d'une orthographe exacte d'en-tête.
function normalizeText_(value) {
  return cleanValue_(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Libellé d'action saisi avec un préfixe parasite dans certains fichiers de
// pôle (ex. "Action socle - Repas végétariens", constaté le 01/10/2026) :
// le préfixe "Action(s) socle(s) [année] -" est retiré pour que l'action
// soit regroupée avec "Repas végétariens".
function cleanActionLabel_(value) {
  return cleanValue_(value).replace(/^actions?\s+socles?(\s+\d{4})?\s*[-–—:]\s*/i, '').trim();
}

// Ouverture des classeurs mémorisée pendant une exécution : le chargement
// du dashboard lit plusieurs onglets du même classeur national, inutile de
// le rouvrir à chaque fois.
const OPENED_SPREADSHEETS_ = {};
function openSpreadsheet_(spreadsheetId) {
  if (!OPENED_SPREADSHEETS_[spreadsheetId]) {
    OPENED_SPREADSHEETS_[spreadsheetId] = SpreadsheetApp.openById(spreadsheetId);
  }
  return OPENED_SPREADSHEETS_[spreadsheetId];
}

function getSheetOrThrow_(spreadsheetId, sheetName) {
  const sheet = openSpreadsheet_(spreadsheetId).getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`Onglet introuvable : ${sheetName}`);
  }
  return sheet;
}

// Lit un onglet sous forme de tableau : {headers, rows}, lignes entièrement
// vides retirées. Les colonnes sont ensuite repérées par POSITION
// (findColumnIndex_), jamais par nom : avec un objet indexé par nom
// d'en-tête, deux colonnes de même titre s'écrasaient (la dernière, parfois
// vide, gagnait). Lit jusqu'à la vraie dernière ligne de la feuille : un
// plafond arbitraire tronquerait silencieusement les données (bug vécu sur
// IMPORT DONNEES).
function readSheetTable_(spreadsheetId, sheetName, headerRow) {
  const values = getSheetOrThrow_(spreadsheetId, sheetName).getDataRange().getDisplayValues();
  return toTable_(values, headerRow);
}

// Variante restreinte à une plage de colonnes (ex. AM:AZ), nécessaire quand
// les mêmes intitulés de colonnes se répètent ailleurs sur la feuille.
function readSheetTableInColumnRange_(spreadsheetId, sheetName, headerRow, firstColumn, lastColumn) {
  const sheet = getSheetOrThrow_(spreadsheetId, sheetName);
  const lastRow = sheet.getLastRow();
  if (lastRow < headerRow) {
    return {headers: [], rows: []};
  }
  const values = sheet.getRange(`${firstColumn}${headerRow}:${lastColumn}${lastRow}`).getDisplayValues();
  return toTable_(values, 1);
}

function toTable_(values, headerRow) {
  if (values.length < headerRow) {
    return {headers: [], rows: []};
  }
  return {
    headers: values[headerRow - 1].map((header) => cleanValue_(header)),
    rows: values.slice(headerRow).filter((row) => row.some((value) => cleanValue_(value)))
  };
}

// Position de la colonne dont l'en-tête commence par l'un des préfixes
// (comparaison normalisée, cf. normalizeText_), -1 si aucune. Quand
// plusieurs colonnes correspondent, on garde la mieux remplie (à égalité,
// la première) : une colonne homonyme vide ajoutée dans le Sheet ne doit
// pas masquer la bonne.
function findColumnIndex_(table, prefixes) {
  const normalizedPrefixes = [].concat(prefixes).map((prefix) => normalizeText_(prefix));
  const candidates = [];
  table.headers.forEach((header, index) => {
    const normalized = normalizeText_(header);
    if (normalized && normalizedPrefixes.some((prefix) => normalized.indexOf(prefix) === 0)) {
      candidates.push(index);
    }
  });
  if (candidates.length <= 1) {
    return candidates.length ? candidates[0] : -1;
  }
  const filled = (index) => table.rows.filter((row) => cleanValue_(row[index])).length;
  return candidates.reduce((best, index) => (filled(index) > filled(best) ? index : best), candidates[0]);
}

function findRequiredColumnIndex_(table, prefixes, sheetLabel) {
  const index = findColumnIndex_(table, prefixes);
  if (index === -1) {
    throw new Error(`Colonne requise introuvable dans ${sheetLabel} : ${[].concat(prefixes).join(' / ')}`);
  }
  return index;
}

function cellAt_(row, index) {
  return index === -1 ? '' : cleanValue_(row[index]);
}

// Diagnostics collectés pendant un chargement (getDashboardBootstrap) et
// renvoyés au navigateur, qui affiche les avertissements : un problème de
// données (colonne renommée, territoires vides…) se voit dans l'appli au
// lieu de passer pour un bug d'affichage.
const DASHBOARD_DIAGNOSTICS_ = {warnings: [], details: {}};
function addDiagnosticWarning_(message) {
  DASHBOARD_DIAGNOSTICS_.warnings.push(message);
  console.warn(message);
}
function setDiagnosticDetail_(key, value) {
  DASHBOARD_DIAGNOSTICS_.details[key] = value;
}
