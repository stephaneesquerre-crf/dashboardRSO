// Lit BDD NOMS : une ligne = un pôle (code, nom, filière, territoire,
// régions). Sert à connaître l'univers des pôles attendus par filière et
// territoire. Les colonnes territoire/régions sont figées à la main dans le
// Sheet (voir README.md) : le code se contente d'un lookup, jamais d'un
// recalcul.
function getPoleReference_() {
  const config = getConfig_();
  const table = readSheetTable_(config.SPREADSHEET_ID, config.POLE_REFERENCE_SHEET_NAME, config.HEADER_ROW);
  if (!table.rows.length) {
    addDiagnosticWarning_(`${config.POLE_REFERENCE_SHEET_NAME} : aucune ligne lue.`);
    return {};
  }

  const sheetLabel = config.POLE_REFERENCE_SHEET_NAME;
  const columns = {
    poleCode: findRequiredColumnIndex_(table, 'code', sheetLabel),
    label: findRequiredColumnIndex_(table, 'nom', sheetLabel),
    filiere: findRequiredColumnIndex_(table, 'filiere', sheetLabel),
    territoire: findColumnIndex_(table, 'territoire'),
    regions: findColumnIndex_(table, 'region')
  };

  const reference = table.rows.reduce((byPoleCode, row) => {
    const poleCode = cellAt_(row, columns.poleCode);
    if (!poleCode) {
      return byPoleCode;
    }
    byPoleCode[normalizeText_(poleCode)] = {
      poleCode,
      label: cellAt_(row, columns.label),
      filiere: cellAt_(row, columns.filiere),
      territoire: cellAt_(row, columns.territoire),
      regions: cellAt_(row, columns.regions)
    };
    return byPoleCode;
  }, {});

  reportPoleReferenceDiagnostics_(table, columns, reference, sheetLabel);
  return reference;
}

// Contrôles de cohérence de BDD NOMS, visibles dans l'appli : colonne
// territoire absente, en-têtes en double, filières sans aucun territoire.
function reportPoleReferenceDiagnostics_(table, columns, reference, sheetLabel) {
  const headerOf = (index) => (index === -1 ? null : `${table.headers[index]} (colonne ${index + 1})`);
  const counts = {};
  table.headers.forEach((header) => {
    const key = normalizeText_(header);
    if (key) counts[key] = (counts[key] || 0) + 1;
  });
  const duplicates = Object.keys(counts).filter((key) => counts[key] > 1);

  const byFiliere = {};
  Object.keys(reference).forEach((key) => {
    const pole = reference[key];
    const filiere = pole.filiere || '(vide)';
    byFiliere[filiere] = byFiliere[filiere] || {poles: 0, avecTerritoire: 0, territoires: {}};
    byFiliere[filiere].poles += 1;
    if (pole.territoire) {
      byFiliere[filiere].avecTerritoire += 1;
      byFiliere[filiere].territoires[pole.territoire] = true;
    }
  });
  Object.keys(byFiliere).forEach((filiere) => {
    byFiliere[filiere].territoires = Object.keys(byFiliere[filiere].territoires).sort();
  });

  setDiagnosticDetail_('bddNoms', {
    colonnes: {
      code: headerOf(columns.poleCode),
      nom: headerOf(columns.label),
      filiere: headerOf(columns.filiere),
      territoire: headerOf(columns.territoire),
      regions: headerOf(columns.regions)
    },
    enTetesEnDouble: duplicates,
    parFiliere: byFiliere
  });

  if (columns.territoire === -1) {
    addDiagnosticWarning_(`${sheetLabel} : aucune colonne dont l'en-tête commence par « Territoire » — le détail par territoire est indisponible.`);
    return;
  }
  if (duplicates.length) {
    addDiagnosticWarning_(`${sheetLabel} : en-têtes en double (${duplicates.join(', ')}) — la colonne la mieux remplie est utilisée.`);
  }
  const withoutTerritory = Object.keys(byFiliere).filter((filiere) => byFiliere[filiere].avecTerritoire === 0);
  if (withoutTerritory.length) {
    addDiagnosticWarning_(`${sheetLabel} : aucun territoire renseigné pour ${withoutTerritory.join(', ')} (colonne « ${table.headers[columns.territoire]} »).`);
  }
}
