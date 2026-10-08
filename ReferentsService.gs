// Vue Référents : lecture du classeur « Synthèse référents Environnement »
// (REFERENTS_SPREADSHEET_ID).
// - onglet « Evolution référents » : photographies datées du taux de
//   couverture par filière (une ligne de dates, puis une ligne par filière) ;
// - onglet « IMPORT REFERENTS » : une ligne par pôle, avec code pôle (même
//   format que BDD NOMS) et référent·es 1, 2 (et 3 si la colonne existe).
// Repérage par le contenu (ligne de dates, en-tête « Code Pôle »), pas par
// numéros de ligne. Ne fait jamais échouer le chargement du dashboard.
function getReferentsForDashboard_(poleReference) {
  const config = getConfig_();
  const result = {evolution: [], poles: []};
  let spreadsheet;
  try {
    spreadsheet = openSpreadsheet_(config.REFERENTS_SPREADSHEET_ID);
  } catch (error) {
    addDiagnosticWarning_(`Référents : classeur inaccessible (${error.message}).`);
    return result;
  }

  const evolutionSheet = spreadsheet.getSheetByName(config.REFERENTS_EVOLUTION_SHEET_NAME);
  if (evolutionSheet) {
    result.evolution = parseReferentsEvolution_(evolutionSheet.getDataRange().getValues());
  } else {
    addDiagnosticWarning_(`Référents : onglet « ${config.REFERENTS_EVOLUTION_SHEET_NAME} » introuvable.`);
  }

  const listSheet = spreadsheet.getSheetByName(config.REFERENTS_LIST_SHEET_NAME);
  if (listSheet) {
    const parsed = parseReferentsList_(listSheet.getDataRange().getValues());
    result.poles = parsed.poles;
    const unknown = parsed.poles.filter((pole) => !poleReference[normalizeText_(pole.poleCode)]).map((pole) => pole.poleCode);
    if (unknown.length) {
      addDiagnosticWarning_(`Référents : ${unknown.length} code(s) pôle absent(s) de BDD NOMS (comptés sans territoire), ex. ${unknown.slice(0, 3).join(', ')}.`);
    }
    if (parsed.withoutCode) {
      addDiagnosticWarning_(`Référents : ${parsed.withoutCode} ligne(s) sans code pôle ignorée(s) dans « ${config.REFERENTS_LIST_SHEET_NAME} ».`);
    }
  } else {
    addDiagnosticWarning_(`Référents : onglet « ${config.REFERENTS_LIST_SHEET_NAME} » introuvable.`);
  }
  return result;
}

// Libellés de filière du classeur des référents -> filière du dashboard.
const REFERENTS_FILIERE_ALIASES_ = {
  'sanitaire': 'SAN',
  'handicap': 'PSH',
  'protection de lenfance': 'PROT ENFANCE',
  'petite enfance': 'PET E',
  'personnes agees': 'PA',
  'padom-pa': 'PA',
  'padom-dom': 'DOM',
  'padom pa': 'PA',
  'padom dom': 'DOM'
};

function mapReferentsFiliere_(label) {
  const key = normalizeText_(label).replace(/’/g, '');
  return REFERENTS_FILIERE_ALIASES_[key] || cleanValue_(label);
}

// [{filiere, label, points: [[AAAA-MM-JJ, taux 0-1]]}]
function parseReferentsEvolution_(values) {
  const isDate = (value) => Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime());
  const datesRow = values.findIndex((row) => row.filter(isDate).length >= 3);
  if (datesRow === -1) {
    addDiagnosticWarning_('Référents : aucune ligne de dates dans l\'onglet d\'évolution.');
    return [];
  }
  const dateCols = [];
  values[datesRow].forEach((cell, col) => {
    if (isDate(cell)) dateCols.push({col, date: Utilities.formatDate(cell, Session.getScriptTimeZone(), 'yyyy-MM-dd')});
  });
  const labelCol = Math.max(0, dateCols[0].col - 1);
  const series = [];
  for (let row = datesRow + 1; row < values.length; row += 1) {
    const label = cleanValue_(values[row][labelCol]);
    if (!label) break;
    const points = dateCols
      .filter(({col}) => typeof values[row][col] === 'number' && isFinite(values[row][col]))
      .map(({col, date}) => [date, values[row][col]]);
    if (points.length) series.push({filiere: mapReferentsFiliere_(label), label, points});
  }
  return series;
}

// {poles: [{poleCode, poleName, filiere, referents: [{name, email, fonction}], dateMaj}], withoutCode}
function parseReferentsList_(values) {
  const headerRow = values.findIndex((row) => row.some((cell) => normalizeText_(cell) === 'code pole'));
  if (headerRow === -1) {
    addDiagnosticWarning_('Référents : en-tête « Code Pôle » introuvable dans la liste.');
    return {poles: [], withoutCode: 0};
  }
  const table = {headers: values[headerRow].map((cell) => cleanValue_(cell)), rows: values.slice(headerRow + 1)};
  const col = {
    filiere: findColumnIndex_(table, 'filiere'),
    poleName: findColumnIndex_(table, 'nom pole'),
    poleCode: findColumnIndex_(table, 'code pole'),
    dateMaj: findColumnIndex_(table, 'date maj')
  };
  const referentCols = [1, 2, 3].map((rank) => ({
    name: findColumnIndex_(table, [`referent.e ${rank}`, `referent ${rank}`, `referente ${rank}`]),
    email: findColumnIndex_(table, `adresse mail (ref. ${rank})`),
    fonction: findColumnIndex_(table, `fonction (ref. ${rank})`)
  })).filter((ref) => ref.name !== -1);

  const poles = [];
  let withoutCode = 0;
  table.rows.forEach((row) => {
    const filiere = cellAt_(row, col.filiere);
    const poleCode = cellAt_(row, col.poleCode);
    // Lignes de titre répétées, totaux, lignes vides.
    if (!filiere || normalizeText_(filiere) === 'filiere' || normalizeText_(poleCode) === 'code pole') return;
    if (!poleCode) {
      withoutCode += 1;
      return;
    }
    const dateValue = col.dateMaj === -1 ? '' : row[col.dateMaj];
    poles.push({
      poleCode,
      poleName: cellAt_(row, col.poleName),
      filiere: mapReferentsFiliere_(filiere),
      // Un·e référent·e est compté·e dès que son nom OU son adresse mail est
      // renseigné (constat du 08/10/2026 : pour PADOM, le nom est souvent
      // vide alors que l'adresse et « Référent.e Oui/Non » = OUI le sont).
      referents: referentCols
        .map((ref) => ({name: cellAt_(row, ref.name), email: cellAt_(row, ref.email), fonction: cellAt_(row, ref.fonction)}))
        .filter((ref) => ref.name || ref.email),
      dateMaj: Object.prototype.toString.call(dateValue) === '[object Date]'
        ? Utilities.formatDate(dateValue, Session.getScriptTimeZone(), 'yyyy-MM-dd')
        : cleanValue_(dateValue)
    });
  });
  return {poles, withoutCode};
}
