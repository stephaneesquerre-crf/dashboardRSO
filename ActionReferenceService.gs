// Poste d'émissions de chaque action, lu dans le référentiel
// "BDD - Actions supplémentaires" du classeur national plutôt que dans la
// colonne "Poste d'émissions" d'IMPORT DONNEES : une même action y est
// parfois rattachée à des postes différents selon les fichiers des pôles
// (constat de Simon, 29/09/2026), ce qui la faisait apparaître dans
// plusieurs thématiques à la fois.
//
// Le même référentiel donne aussi la réduction du catalogue de chaque
// action (colonne "Réduction…", optionnelle), utilisée pour recalculer les
// pôles pilotes comme des pôles non pilotes (option de la vue Détail par
// poste).
//
// Clé = nom d'action normalisé (normalizeText_). Ne fait jamais échouer le
// chargement : onglet ou colonnes introuvables -> référentiel vide, et
// chaque ligne garde alors le poste saisi par le pôle.
function getActionCatalogue_() {
  const table = readActionReferenceTable_();
  if (!table) {
    return {};
  }
  return table.rows.reduce((byAction, row) => {
    const action = cleanActionLabel_(row[table.actionIndex]);
    if (!action) {
      return byAction;
    }
    byAction[normalizeText_(action)] = {
      poste: cleanValue_(row[table.posteIndex]),
      reduction: table.reductionIndex === -1 ? '' : cleanValue_(row[table.reductionIndex])
    };
    return byAction;
  }, {});
}

function resolveFactThematique_(fact, actionCatalogue) {
  const entry = actionCatalogue[normalizeText_(fact.action)];
  return (entry && entry.poste) || fact.thematique;
}

function resolveFactCatalogueReduction_(fact, actionCatalogue) {
  const entry = actionCatalogue[normalizeText_(fact.action)];
  return entry ? entry.reduction : '';
}

// La ligne d'en-tête n'est pas forcément la première (titres, lignes
// vides) : on la cherche dans les 10 premières lignes, comme la première
// contenant à la fois une colonne "Action…" et une colonne "Poste…" /
// "Catégorie…" / "Thématique…".
function readActionReferenceTable_() {
  const config = getConfig_();
  const sheet = openSpreadsheet_(config.SPREADSHEET_ID).getSheetByName(config.ACTIONS_REFERENCE_SHEET_NAME);
  if (!sheet) {
    addDiagnosticWarning_(`Référentiel des actions : onglet introuvable (${config.ACTIONS_REFERENCE_SHEET_NAME}) — postes saisis par les pôles conservés, pôles pilotes non recalculables.`);
    return null;
  }
  const values = sheet.getDataRange().getDisplayValues();
  const startsWith = (cell, prefixes) => prefixes.some((prefix) => normalizeText_(cell).indexOf(prefix) === 0);
  for (let rowIndex = 0; rowIndex < Math.min(values.length, 10); rowIndex += 1) {
    const header = values[rowIndex];
    const actionIndex = header.findIndex((cell) => startsWith(cell, ['action']));
    const posteIndex = header.findIndex((cell) => startsWith(cell, ['poste', 'categorie', 'thematique']));
    if (actionIndex !== -1 && posteIndex !== -1) {
      const reductionIndex = header.findIndex((cell) => startsWith(cell, ['reduction']));
      return {
        reductionIndex: reductionIndex,
        reductionHeader: reductionIndex === -1 ? '(colonne Réduction introuvable)' : header[reductionIndex],
        headerRow: rowIndex + 1,
        actionHeader: header[actionIndex],
        posteHeader: header[posteIndex],
        actionIndex: actionIndex,
        posteIndex: posteIndex,
        rows: values.slice(rowIndex + 1)
      };
    }
  }
  addDiagnosticWarning_('Référentiel des actions : en-têtes "Action…" et "Poste…" introuvables dans les 10 premières lignes.');
  return null;
}

// À exécuter manuellement depuis l'éditeur : vérifie la lecture du
// référentiel et liste (1) les actions d'IMPORT DONNEES absentes du
// référentiel (elles gardent le poste saisi par le pôle), (2) les actions
// dont le poste change par rapport à la saisie des pôles.
function testActionReference() {
  const table = readActionReferenceTable_();
  if (!table) {
    Logger.log('Référentiel illisible : voir les avertissements ci-dessus.');
    return;
  }
  const catalogue = getActionCatalogue_();
  const reference = {};
  Object.keys(catalogue).forEach((key) => { if (catalogue[key].poste) reference[key] = catalogue[key].poste; });
  const facts = getFactRecords_();
  const missing = {};
  const changed = {};
  facts.forEach((fact) => {
    const key = normalizeText_(fact.action);
    const poste = reference[key];
    if (!poste) {
      missing[fact.action] = (missing[fact.action] || 0) + 1;
    } else if (fact.thematique && normalizeText_(fact.thematique) !== normalizeText_(poste)) {
      const label = `${fact.action} : "${fact.thematique}" -> "${poste}"`;
      changed[label] = (changed[label] || 0) + 1;
    }
  });
  Logger.log(JSON.stringify({
    enTete: `ligne ${table.headerRow} — "${table.actionHeader}" / "${table.posteHeader}" / "${table.reductionHeader}"`,
    exemplesReduction: Object.keys(catalogue).slice(0, 5).map((key) => `${key} : ${catalogue[key].reduction}`),
    actionsDansLeReferentiel: Object.keys(reference).length,
    actionsAbsentesDuReferentiel: missing,
    postesModifies: changed
  }, null, 2));
}
