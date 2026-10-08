// Protection de l'enfance : les avancements sont produits dans un autre
// outil et n'arrivent pas dans IMPORT DONNEES, mais dans l'onglet
// « PROT ENFANCE » du classeur national, sous forme de deux tableaux :
// - un tableau brut, dont une ligne porte les codes pôle au format de
//   BDD NOMS (ex. « Territoire A : IDF_4507 ») ;
// - un tableau retravaillé, une ligne par action socle (libellés standard)
//   et une colonne par pôle, dans les MÊMES colonnes que le tableau brut,
//   suivi de colonnes de synthèse (SOMME, MOYENNE, % TERMINES…).
//
// Les tableaux se décaleront quand Simon ajoutera les actions socles 2027 :
// rien n'est repéré par numéro de ligne.
// - tableau retravaillé = la ligne d'en-tête qui contient « SOMME » ;
//   colonnes pôle = celles situées avant « SOMME » ; actions = lignes
//   suivantes jusqu'à la première sans libellé ;
// - codes pôle = la ligne, au-dessus, dont le plus de cellules (dans ces
//   colonnes) sont des codes de BDD NOMS.
// La campagne d'une action (Action socle 2024…) n'est pas dans l'onglet :
// elle est reprise des autres filières (même libellé d'action).
//
// Un pôle déjà présent dans IMPORT DONNEES n'est pas repris d'ici (pas de
// double compte le jour où ces données y arriveront).
function getProtEnfanceFacts_(poleReference, importFacts) {
  const config = getConfig_();
  const sheet = openSpreadsheet_(config.SPREADSHEET_ID).getSheetByName(config.PROT_ENFANCE_SHEET_NAME);
  if (!sheet) {
    addDiagnosticWarning_(`Protection de l'enfance : onglet « ${config.PROT_ENFANCE_SHEET_NAME} » introuvable.`);
    return [];
  }
  const parsed = parseProtEnfanceValues_(sheet.getDataRange().getValues(), poleReference);
  parsed.warnings.forEach((warning) => addDiagnosticWarning_(`Protection de l'enfance : ${warning}`));

  const importedPoles = {};
  const campaignVotes = {};
  importFacts.forEach((fact) => {
    importedPoles[normalizeText_(fact.poleCode)] = true;
    if (!fact.actionSocle) return;
    const key = normalizeText_(fact.action);
    campaignVotes[key] = campaignVotes[key] || {};
    const vote = `${fact.actionSocle}\u0001${fact.volet}`;
    campaignVotes[key][vote] = (campaignVotes[key][vote] || 0) + 1;
  });
  const campaignOf = (action) => {
    const votes = campaignVotes[normalizeText_(action)];
    if (!votes) return ['', ''];
    const best = Object.keys(votes).sort((left, right) => votes[right] - votes[left])[0];
    return best.split('\u0001');
  };

  const skipped = {};
  const facts = [];
  parsed.rows.forEach((row) => {
    if (importedPoles[normalizeText_(row.poleCode)]) {
      skipped[row.poleCode] = true;
      return;
    }
    const [actionSocle, volet] = campaignOf(row.action);
    facts.push({
      poleCode: row.poleCode,
      action: row.action,
      volet: volet,
      thematique: '',
      avancement: row.avancement,
      filiere: config.PROT_ENFANCE_FILIERE,
      actionSocle: actionSocle,
      reductionADate: '',
      reductionCible: ''
    });
  });
  setDiagnosticDetail_('protectionEnfance', {
    lignesActions: parsed.actionCount,
    poles: parsed.poleCount,
    faits: facts.length,
    polesDejaDansImportDonnees: Object.keys(skipped)
  });
  return facts;
}

// Cœur du parsing, sans appel à SpreadsheetApp (testable hors Apps Script).
// Renvoie {rows: [{poleCode, action, avancement}], warnings, actionCount, poleCount}.
function parseProtEnfanceValues_(values, poleReference) {
  const warnings = [];
  const text = (row, col) => cleanValue_((values[row] || [])[col]);
  const result = {rows: [], warnings, actionCount: 0, poleCount: 0};

  let headerRow = -1;
  let sommeCol = -1;
  for (let row = 0; row < values.length && headerRow === -1; row += 1) {
    const col = values[row].findIndex((cell) => normalizeText_(cell) === 'somme');
    if (col !== -1) {
      headerRow = row;
      sommeCol = col;
    }
  }
  if (headerRow === -1) {
    warnings.push('tableau retravaillé introuvable (aucune en-tête « SOMME »).');
    return result;
  }

  const poleCols = [];
  for (let col = 0; col < sommeCol; col += 1) {
    if (text(headerRow, col)) poleCols.push(col);
  }
  if (!poleCols.length) {
    warnings.push('aucune colonne pôle avant « SOMME ».');
    return result;
  }
  const labelCol = poleCols[0] - 1;

  // Ligne des codes pôle : celle qui contient le plus de codes de BDD NOMS.
  let codesRow = -1;
  let bestMatches = 0;
  for (let row = 0; row < headerRow; row += 1) {
    const matches = poleCols.filter((col) => poleReference[normalizeText_(text(row, col))]).length;
    if (matches > bestMatches) {
      bestMatches = matches;
      codesRow = row;
    }
  }
  if (codesRow === -1) {
    warnings.push('aucune ligne de codes pôle reconnus dans BDD NOMS au-dessus du tableau retravaillé ; libellés d\'en-tête utilisés à la place.');
    codesRow = headerRow;
  }
  const unknown = poleCols.map((col) => text(codesRow, col)).filter((code) => code && !poleReference[normalizeText_(code)]);
  if (unknown.length) {
    warnings.push(`${unknown.length} pôle(s) absent(s) de BDD NOMS (sans territoire) : ${unknown.join(', ')}.`);
  }
  result.poleCount = poleCols.length;

  for (let row = headerRow + 1; row < values.length; row += 1) {
    const action = cleanActionLabel_(text(row, labelCol));
    if (!action) break;
    result.actionCount += 1;
    poleCols.forEach((col) => {
      const avancement = toAvancementLabel_((values[row] || [])[col]);
      const poleCode = text(codesRow, col);
      if (avancement && poleCode) result.rows.push({poleCode, action, avancement});
    });
  }
  return result;
}

// 0.4 -> "40%" ; "40%" et "Abandonnée" inchangés ; vide -> ''.
function toAvancementLabel_(value) {
  if (typeof value === 'number' && isFinite(value)) {
    return `${Math.round((value <= 1 ? value * 100 : value) * 10) / 10}%`;
  }
  return cleanValue_(value);
}
