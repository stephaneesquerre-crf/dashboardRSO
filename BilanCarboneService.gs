// Cibles de réduction calculées (20/10/2026) pour les lignes sans
// « Réduction carbone cible » (ex. PROT ENFANCE, PET E), à partir de :
// - la réduction de l'action dans le catalogue (« BDD - Actions
//   supplémentaires », en points de % du bilan CRF : la somme des
//   réductions donne la réduction potentielle totale) ;
// - l'onglet « BDD - Bilan carbone » : poids de chaque poste d'émissions
//   dans le bilan de chaque type d'établissement, une ligne « Moyenne
//   filière … » par filière, et le poids de chaque poste dans le bilan CRF.
//
// Même formule que la cellule L22 des fichiers des pôles (Simon) :
//   cible = réduction catalogue × poids du poste pour la filière
//           ÷ poids du poste dans le bilan CRF
// Le type d'établissement des pôles n'étant renseigné nulle part, la ligne
// « Moyenne filière … » de la filière est utilisée.
//
// Ne fait jamais échouer le chargement : onglet absent ou illisible ->
// aucune cible calculée et avertissement.

// Libellés de filière de « BDD - Bilan carbone » -> filières du dashboard.
// « Compétence » = Croix-Rouge Compétence (CRC). « Bénévoles » n'a pas de
// filière dans le dashboard.
const BILAN_FILIERE_ALIASES_ = {
  'competence': ['CRC'],
  'flex': ['FLEX'],
  'handicap': ['PSH'],
  'padom': ['PA', 'DOM'],
  'petite enfance': ['PET E'],
  'protection de lenfance': ['PROT ENFANCE'],
  'sanitaire': ['SAN']
};

function parsePercentCell_(value) {
  if (typeof value === 'number') return value <= 1.5 ? value * 100 : value;
  const compact = cleanValue_(value).replace(/[\s  %]/g, '').replace(',', '.');
  return compact && isFinite(Number(compact)) ? Number(compact) : null;
}

// {postes: [libellé], filieres: {FILIERE: {poste normalisé: poids %}},
//  national: {poste normalisé: poids %}, nationalSource, warnings}
function parseBilanCarboneValues_(values) {
  const result = {postes: [], filieres: {}, national: {}, nationalSource: '', warnings: []};
  const headerRow = values.findIndex((row) => row.some((cell) => normalizeText_(cell) === 'transport') &&
    row.some((cell) => normalizeText_(cell) === 'total'));
  if (headerRow === -1) {
    result.warnings.push('en-tête (Transport … Total) introuvable');
    return result;
  }
  const header = values[headerRow];
  const firstPoste = header.findIndex((cell) => normalizeText_(cell) === 'transport');
  const totalCol = header.findIndex((cell, index) => index > firstPoste && normalizeText_(cell) === 'total');
  const posteCols = [];
  for (let col = firstPoste; col < totalCol; col += 1) {
    if (cleanValue_(header[col])) posteCols.push({col, key: normalizeText_(header[col]), label: cleanValue_(header[col])});
  }
  result.postes = posteCols.map((poste) => poste.label);
  const filiereCol = firstPoste - 2;
  const typeCol = firstPoste - 1;
  const weightsOf = (row) => {
    const weights = {};
    posteCols.forEach(({col, key}) => { weights[key] = parsePercentCell_(row[col]); });
    return weights;
  };

  let mainNational = null;
  for (let rowIndex = headerRow + 1; rowIndex < values.length; rowIndex += 1) {
    const row = values[rowIndex];
    const type = normalizeText_(row[typeCol]);
    if (type === 'bilan crf') {
      mainNational = weightsOf(row);
      continue;
    }
    if (type.indexOf('moyenne') !== 0) continue;
    const aliases = BILAN_FILIERE_ALIASES_[normalizeText_(row[filiereCol]).replace(/’/g, '')];
    if (!aliases) continue;
    aliases.forEach((filiere) => { result.filieres[filiere] = weightsOf(row); });
  }

  // Bloc « Bilan CRF » à droite du tableau (colonne des catégories, puis
  // colonne des poids) : c'est lui qu'utilise la formule L22 des pôles.
  let sideNational = null;
  for (let rowIndex = 0; rowIndex < values.length && !sideNational; rowIndex += 1) {
    values[rowIndex].forEach((cell, col) => {
      if (sideNational || col <= totalCol || normalizeText_(cell) !== 'bilan crf') return;
      const weights = {};
      for (let next = rowIndex + 1; next < values.length; next += 1) {
        const label = normalizeText_(values[next][col - 1]);
        if (!label) break;
        weights[label] = parsePercentCell_(values[next][col]);
      }
      if (Object.keys(weights).length) sideNational = weights;
    });
  }
  result.national = sideNational || mainNational || {};
  result.nationalSource = sideNational ? 'bloc « Bilan CRF » à droite du tableau' : (mainNational ? 'ligne « Bilan CRF » du tableau' : '');
  if (!result.nationalSource) result.warnings.push('poids du bilan CRF introuvables');

  if (sideNational && mainNational) {
    const differing = posteCols
      .filter(({key}) => typeof sideNational[key] === 'number' && typeof mainNational[key] === 'number' &&
        Math.abs(sideNational[key] - mainNational[key]) > 0.05)
      .map(({key, label}) => `${label} ${mainNational[key]} % / ${sideNational[key]} %`);
    if (differing.length) {
      result.warnings.push(`poids du bilan CRF différents entre la ligne du tableau et le bloc de droite (${differing.join(' ; ')}) : bloc de droite utilisé, comme la formule des pôles`);
    }
  }
  return result;
}

function getBilanCarbone_() {
  const config = getConfig_();
  let values = takePrefetchedDisplayValues_(config.SPREADSHEET_ID, config.BILAN_CARBONE_SHEET_NAME, '');
  if (!values) {
    const sheet = openSpreadsheet_(config.SPREADSHEET_ID).getSheetByName(config.BILAN_CARBONE_SHEET_NAME);
    if (!sheet) {
      addDiagnosticWarning_(`Bilan carbone : onglet « ${config.BILAN_CARBONE_SHEET_NAME} » introuvable — pas de cible calculée pour les lignes sans cible.`);
      return null;
    }
    values = sheet.getDataRange().getDisplayValues();
  }
  const parsed = parseBilanCarboneValues_(values);
  parsed.warnings.forEach((warning) => addDiagnosticWarning_(`Bilan carbone : ${warning}.`));
  return parsed;
}

// Cible calculée (texte « -0,61% », comme les cibles saisies) ou '' :
// seulement pour une ligne SANS cible saisie, dont l'action a une
// réduction au catalogue, un poste connu et une filière présente dans
// « BDD - Bilan carbone ».
function computeCibleCalculee_(fact, bilan) {
  if (!bilan || cleanValue_(fact.reductionCible)) return '';
  const catalogue = parsePercentCell_(String(fact.catalogueReduction || '').replace(/−/g, '-'));
  if (catalogue === null || /kg/i.test(String(fact.catalogueReduction))) return '';
  const filiereWeights = bilan.filieres[fact.filiere];
  const poste = normalizeText_(fact.thematique);
  if (!filiereWeights || !poste) return '';
  const filiereWeight = filiereWeights[poste];
  const nationalWeight = bilan.national[poste];
  if (typeof filiereWeight !== 'number' || typeof nationalWeight !== 'number' || nationalWeight === 0) return '';
  const value = -Math.abs(catalogue) * filiereWeight / nationalWeight;
  return `${(Math.round(value * 1000) / 1000).toString().replace('.', ',')}%`;
}

// À lancer depuis l'éditeur : poids lus, source des poids du bilan CRF et
// nombre de cibles calculées par filière.
function testBilanCarbone() {
  const bootstrap = getDashboardBootstrap();
  if (bootstrap.accessRequired) {
    Logger.log('Accès manquant au classeur national.');
    return;
  }
  Logger.log(JSON.stringify(bootstrap.diagnostics.details.bilanCarbone, null, 2));
}
