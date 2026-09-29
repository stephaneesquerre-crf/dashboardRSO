// Import des archives mensuelles du "Tableau de bord VA" vers un onglet
// unique au format long (une ligne = une valeur), base de la future vue
// Évolution.
//
// Les archives sont des copier-coller manuels du tableau : leur mise en
// page varie un peu d'un mois à l'autre (ligne du titre, colonne du titre,
// libellés de filière "PET E" / "PETITE ENFANCE" / "PET. ENF.", blocs
// dupliqués plus bas dans l'onglet, cellules #REF!). Le repérage se fait
// donc par le contenu, jamais par des numéros de ligne figés :
// - bloc « TX DE TERMINES PARMIS LES CONCERNES » : ligne du titre (noms de
//   filière, une filière = 3 colonnes %, # terminés, # réponses
//   concernés), ligne suivante (TOTAL, %…), puis une ligne par action,
//   la campagne ("Actions socles 2024"…) n'étant écrite qu'en tête de
//   groupe (cellules fusionnées) ;
// - bloc des réponses au-dessus : "Nombre total de structures", "Nombre
//   de structures ayant répondu", "% de réponses (actions socles 2024)".
// Seul le premier bloc de chaque onglet est lu (certains onglets
// contiennent une seconde copie plus bas).
//
// Idempotent : réimporter un onglet remplace ses lignes, sans doublon.

const HISTORY_HEADERS_ = ['Mois', 'Onglet source', 'Campagne', 'Action', 'Filière (libellé source)', 'Filière', 'Indicateur', 'Valeur', 'Importé le'];

// Libellés de filière des archives -> nom de filière du dashboard (clés
// normalisées par normalizeArchiveLabel_). Un libellé absent est gardé
// tel quel. PADOM n'est pas séparé en PA / DOM dans les archives.
const ARCHIVE_FILIERE_ALIASES_ = {
  'total': 'TOTAL',
  'petite enfance': 'PET E',
  'pet e': 'PET E',
  'pet enf': 'PET E',
  'sanitaire': 'SAN',
  'protection de lenfance': 'PROT ENFANCE',
  'prot enf': 'PROT ENFANCE'
};

// À lancer depuis l'éditeur, par exemple chaque mois après avoir créé le
// nouvel onglet d'archive : (ré)importe tous les onglets dont le nom
// commence par CONFIG.ARCHIVES_SHEET_PREFIX.
function importArchivesTableauDeBord() {
  const config = getConfig_();
  const source = SpreadsheetApp.openById(config.ARCHIVES_SPREADSHEET_ID || config.SPREADSHEET_ID);
  const names = source.getSheets()
    .map((sheet) => sheet.getName())
    .filter((name) => name.indexOf(config.ARCHIVES_SHEET_PREFIX) === 0);
  importArchiveSheets_(source, names);
}

// Variante pour un seul onglet, à appeler depuis une petite fonction de
// l'éditeur, ex. : function importSeptembre() { importArchiveTableauDeBord('Archives 09.26'); }
function importArchiveTableauDeBord(sheetName) {
  const config = getConfig_();
  const source = SpreadsheetApp.openById(config.ARCHIVES_SPREADSHEET_ID || config.SPREADSHEET_ID);
  importArchiveSheets_(source, [sheetName]);
}

function importArchiveSheets_(source, sheetNames) {
  const config = getConfig_();
  const importedAt = new Date();
  const newRows = [];
  const report = [];
  const sheetsByMonth = {};
  sheetNames.forEach((name) => {
    const sheet = source.getSheetByName(name);
    if (!sheet) {
      report.push(`${name} : onglet introuvable`);
      return;
    }
    const parsed = parseArchiveValues_(sheet.getDataRange().getValues(), name);
    if (parsed.month) {
      sheetsByMonth[parsed.month] = (sheetsByMonth[parsed.month] || []).concat([name]);
    }
    parsed.rows.forEach((row) => newRows.push(row.concat([importedAt])));
    report.push(`${name} : ${parsed.rows.length} valeurs (mois ${parsed.month || '?'})${parsed.warnings.length ? ' — ' + parsed.warnings.join(' ; ') : ''}`);
  });

  Object.keys(sheetsByMonth).forEach((month) => {
    if (sheetsByMonth[month].length > 1) {
      report.push(`ATTENTION ${month} : plusieurs onglets pour le même mois (${sheetsByMonth[month].join(', ')}) — à dédoublonner à la source ou à filtrer par "Onglet source".`);
    }
  });

  // L'historique est écrit dans le classeur des archives (le classeur
  // national n'est alors pas modifié) ; même classeur que SPREADSHEET_ID
  // tant que ARCHIVES_SPREADSHEET_ID est vide.
  const target = source;
  const history = target.getSheetByName(config.HISTORY_SHEET_NAME) || target.insertSheet(config.HISTORY_SHEET_NAME);
  const existing = history.getLastRow() > 1
    ? history.getRange(2, 1, history.getLastRow() - 1, HISTORY_HEADERS_.length).getValues()
    : [];
  const replaced = new Set(sheetNames);
  const kept = existing.filter((row) => !replaced.has(String(row[1])));
  const allRows = kept.concat(newRows);

  history.clearContents();
  history.getRange(1, 1, 1, HISTORY_HEADERS_.length).setValues([HISTORY_HEADERS_]);
  if (allRows.length) {
    history.getRange(2, 1, allRows.length, HISTORY_HEADERS_.length).setValues(allRows);
  }
  Logger.log(report.concat([`${allRows.length} lignes au total dans "${config.HISTORY_SHEET_NAME}".`]).join('\n'));
}

// À lancer depuis l'éditeur quand un onglet n'est pas reconnu (message
// « bloc ... introuvable ») : affiche le texte des 45 premières lignes
// pour adapter le repérage. Ex. : function diag0925() { diagnosticArchiveLayout('Archives 09/25'); }
function diagnosticArchiveLayout(sheetName) {
  const config = getConfig_();
  const sheet = SpreadsheetApp.openById(config.ARCHIVES_SPREADSHEET_ID || config.SPREADSHEET_ID).getSheetByName(sheetName);
  if (!sheet) {
    Logger.log(`Onglet introuvable : ${sheetName}`);
    return;
  }
  const values = sheet.getRange(1, 1, Math.min(sheet.getLastRow(), 45), Math.min(sheet.getLastColumn(), 32)).getDisplayValues();
  const columnName = (index) => (index >= 26 ? String.fromCharCode(64 + Math.floor(index / 26)) : '') + String.fromCharCode(65 + (index % 26));
  Logger.log(values.map((row, rowIndex) => {
    const cells = row
      .map((value, colIndex) => (String(value).trim() ? `${columnName(colIndex)}=${String(value).trim().slice(0, 30)}` : ''))
      .filter(Boolean);
    return cells.length ? `${rowIndex + 1} | ${cells.join(' | ')}` : '';
  }).filter(Boolean).join('\n'));
}

// Cœur du parsing, sans appel à SpreadsheetApp (testable hors Apps
// Script) : values = tableau 2D des valeurs brutes de l'onglet.
function parseArchiveValues_(values, sheetName) {
  const warnings = [];
  const rows = [];
  const month = archiveMonthFromName_(sheetName);
  if (!month) warnings.push('mois non reconnu dans le nom de l\'onglet (attendu MMAA ou MM.AA)');

  const text = (row, col) => String((values[row] || [])[col] === undefined || (values[row] || [])[col] === null ? '' : values[row][col]).trim();
  const numberAt = (row, col) => {
    const value = (values[row] || [])[col];
    return typeof value === 'number' && isFinite(value) ? value : null;
  };

  // 1. Titre du bloc "taux de terminés" (première occurrence seulement).
  let titleRow = -1;
  let titleCol = -1;
  for (let row = 0; row < values.length && titleRow === -1; row += 1) {
    for (let col = 0; col < values[row].length; col += 1) {
      if (normalizeArchiveLabel_(text(row, col)).indexOf('tx de termines') === 0) {
        titleRow = row;
        titleCol = col;
        break;
      }
    }
  }
  if (titleRow === -1) {
    // Mise en page antérieure à 11/2025 : bloc « Tableau de la moyenne
    // des avancements » (cf. parseLegacyArchiveValues_).
    const legacy = parseLegacyArchiveValues_(values, sheetName, month);
    if (legacy) return {month, rows: legacy, warnings};
    warnings.push('ni bloc "TX DE TERMINES PARMIS LES CONCERNES" ni bloc "Tableau de la moyenne des avancements" trouvé');
    return {month, rows, warnings};
  }

  const subRow = titleRow + 1;
  const totalCol = values[subRow].findIndex((cell, col) => col > titleCol - 1 && normalizeArchiveLabel_(cell) === 'total');
  if (totalCol === -1) {
    warnings.push('colonne TOTAL introuvable sous le titre');
    return {month, rows, warnings};
  }
  const campaignCol = totalCol - 3;
  const actionCol = totalCol - 2;

  // 2. Filières : un libellé dans la ligne du titre, puis 3 colonnes.
  const filieres = [];
  for (let col = totalCol + 1; col < values[titleRow].length; col += 1) {
    const label = text(titleRow, col);
    if (label) filieres.push({label, col});
  }
  if (!filieres.length) warnings.push('aucune filière trouvée dans la ligne du titre');

  const push = (campaign, action, filiereLabel, indicator, value) => {
    if (value === null) return;
    rows.push([month || '', sheetName, campaign, action, filiereLabel, mapArchiveFiliere_(filiereLabel), indicator, value]);
  };

  // 3. Une ligne par action, jusqu'à la première ligne sans campagne ni action.
  let campaign = '';
  for (let row = subRow + 1; row < values.length; row += 1) {
    const campaignCell = text(row, campaignCol);
    const action = text(row, actionCol);
    if (!campaignCell && !action) break;
    if (campaignCell) campaign = campaignCell;
    if (!action) continue;
    push(campaign, action, 'TOTAL', 'tauxTerminees', numberAt(row, totalCol));
    filieres.forEach((filiere) => {
      push(campaign, action, filiere.label, 'tauxTerminees', numberAt(row, filiere.col));
      push(campaign, action, filiere.label, 'terminees', numberAt(row, filiere.col + 1));
      push(campaign, action, filiere.label, 'concernes', numberAt(row, filiere.col + 2));
    });
  }

  // 4. Bloc des réponses, au-dessus du titre : en-têtes de filière sur la
  // ligne qui porte "TOTAL" dans la même colonne que le bloc principal.
  let responseHeaderRow = -1;
  for (let row = titleRow - 1; row >= 0; row -= 1) {
    if (normalizeArchiveLabel_(text(row, totalCol)) === 'total') {
      responseHeaderRow = row;
      break;
    }
  }
  if (responseHeaderRow !== -1) {
    const responseColumns = [{label: 'TOTAL', col: totalCol}];
    for (let col = totalCol + 1; col < values[responseHeaderRow].length; col += 1) {
      const label = text(responseHeaderRow, col);
      if (label) responseColumns.push({label, col});
    }
    for (let row = responseHeaderRow + 1; row < titleRow; row += 1) {
      const label = normalizeArchiveLabel_(text(row, actionCol));
      let indicator = '';
      let rowCampaign = '';
      if (label.indexOf('nombre total de structures') === 0) indicator = 'nbStructures';
      else if (label.indexOf('nombre de structures ayant') === 0) indicator = 'nbRepondants';
      else if (label.indexOf('de reponses') !== -1) {
        indicator = 'tauxReponse';
        const match = text(row, actionCol).match(/actions? socles? (\d{4})/i);
        rowCampaign = match ? `Actions socles ${match[1]}` : '';
      }
      if (!indicator) continue;
      responseColumns.forEach((column) => push(rowCampaign, '', column.label, indicator, numberAt(row, column.col)));
    }
  } else {
    warnings.push('bloc des réponses introuvable');
  }

  return {month, rows, warnings};
}

// Mise en page des archives 09/25 et 10/25 (relevée avec
// diagnosticArchiveLayout le 30/09/2026) :
// - bloc de gauche, titre « Tableau de la moyenne des avancements » (col.
//   A), puis en-têtes % | # terminés | Total | Total concerné | (sans
//   titre : taux de terminés parmi les concernés, ex. 71 / 165 = 43 %),
//   puis une ligne par action (campagne en col. A, action en col. B) ;
//   uniquement le TOTAL, pas de détail par filière. Les indicateurs DIP
//   (colonne "# terminés" contenant "(objectif …)") sont ignorés.
// - bloc de droite, même titre plus bas : # terminés par filière (pas de
//   concernés, donc pas de taux par filière). Lignes contenant des valeurs
//   non entières (indicateurs DIP en %) ignorées.
// - réponses : "Nombre total de structures" / "Nombre de structures ayant
//   répondu", filières sur la ligne au-dessus.
// Renvoie null si le bloc n'est pas trouvé.
function parseLegacyArchiveValues_(values, sheetName, month) {
  const text = (row, col) => String((values[row] || [])[col] === undefined || (values[row] || [])[col] === null ? '' : values[row][col]).trim();
  const label = (row, col) => normalizeArchiveLabel_(text(row, col));
  const numberAt = (row, col) => {
    const value = (values[row] || [])[col];
    return typeof value === 'number' && isFinite(value) ? value : null;
  };
  const titles = [];
  values.forEach((row, rowIndex) => row.forEach((cell, colIndex) => {
    if (normalizeArchiveLabel_(cell).indexOf('tableau de la moyenne des avan') === 0) titles.push({row: rowIndex, col: colIndex});
  }));
  if (!titles.length) return null;

  const rows = [];
  const push = (campaign, action, filiereLabel, indicator, value) => {
    if (value === null) return;
    rows.push([month || '', sheetName, campaign, action, filiereLabel, mapArchiveFiliere_(filiereLabel), indicator, value]);
  };
  const isEnd = (row, actionCol) => !text(row, actionCol) || text(row, actionCol).charAt(0) === '*';

  // Bloc de gauche (TOTAL).
  const left = titles[0];
  const headerRow = left.row + 1;
  const rateCol = values[headerRow].findIndex((cell) => normalizeArchiveLabel_(cell) === '%');
  const doneCol = values[headerRow].findIndex((cell) => normalizeArchiveLabel_(cell).indexOf('# termines') === 0);
  const concernedCol = values[headerRow].findIndex((cell) => normalizeArchiveLabel_(cell).indexOf('total concerne') === 0);
  let campaign = '';
  for (let row = headerRow + 1; row < values.length; row += 1) {
    if (text(row, left.col)) campaign = text(row, left.col);
    const action = text(row, left.col + 1);
    if (isEnd(row, left.col + 1)) break;
    const doneRaw = doneCol === -1 ? '' : text(row, doneCol);
    if (doneRaw && numberAt(row, doneCol) === null) continue; // indicateur DIP "(objectif …)"
    if (rateCol !== -1) push(campaign, action, 'TOTAL', 'moyenneAvancement', numberAt(row, rateCol));
    if (doneCol !== -1) push(campaign, action, 'TOTAL', 'terminees', numberAt(row, doneCol));
    if (concernedCol !== -1) {
      push(campaign, action, 'TOTAL', 'concernes', numberAt(row, concernedCol));
      push(campaign, action, 'TOTAL', 'tauxTerminees', numberAt(row, concernedCol + 1));
    }
  }

  // Bloc de droite (# terminés par filière).
  if (titles.length > 1) {
    const right = titles[1];
    const filieres = [];
    for (let col = right.col + 2; col < values[right.row].length; col += 1) {
      if (text(right.row, col)) filieres.push({label: text(right.row, col), col});
    }
    let rightCampaign = '';
    for (let row = right.row + 2; row < values.length; row += 1) {
      if (text(row, right.col)) rightCampaign = text(row, right.col);
      if (isEnd(row, right.col + 1)) break;
      const counts = filieres.map((filiere) => numberAt(row, filiere.col));
      if (counts.some((value) => value !== null && Math.round(value) !== value)) continue;
      filieres.forEach((filiere, index) => push(rightCampaign, text(row, right.col + 1), filiere.label, 'terminees', counts[index]));
    }
  }

  // Réponses.
  values.forEach((row, rowIndex) => row.forEach((cell, colIndex) => {
    const key = normalizeArchiveLabel_(cell);
    let indicator = '';
    if (key.indexOf('nombre total de structures') === 0) indicator = 'nbStructures';
    else if (key.indexOf('nombre de structures ayant') === 0) indicator = 'nbRepondants';
    if (!indicator) return;
    // En-têtes de filière : première ligne au-dessus dont la cellule
    // voisine est un texte (et non un nombre).
    let headerRowIndex = rowIndex - 1;
    while (headerRowIndex >= 0 && !(text(headerRowIndex, colIndex + 1) && numberAt(headerRowIndex, colIndex + 1) === null)) {
      headerRowIndex -= 1;
    }
    if (headerRowIndex < 0) return;
    for (let col = colIndex + 1; col < row.length; col += 1) {
      const filiere = text(headerRowIndex, col);
      if (filiere) push('', '', filiere, indicator, numberAt(rowIndex, col));
    }
  }));

  return rows;
}

// "Archives 1125" -> "2025-11" ; "Archives 09.26" ou "Archives 09/26" ->
// "2026-09" ; "Archives 01/26 2" (seconde copie d'un mois) -> "2026-01" :
// on prend le premier groupe MM[./]AA du nom, le suffixe éventuel est
// ignoré (les doublons de mois sont signalés à l'import).
function archiveMonthFromName_(sheetName) {
  const match = String(sheetName).match(/(\d{2})[.\/]?(\d{2})(?!\d)/);
  if (!match) return '';
  const month = Number(match[1]);
  if (month < 1 || month > 12) return '';
  return `20${match[2]}-${match[1]}`;
}

function normalizeArchiveLabel_(value) {
  return String(value === null || value === undefined ? '' : value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’.]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function mapArchiveFiliere_(label) {
  return ARCHIVE_FILIERE_ALIASES_[normalizeArchiveLabel_(label)] || String(label).trim();
}
