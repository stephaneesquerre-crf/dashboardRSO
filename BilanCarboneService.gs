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
// « Moyenne filière … » de la filière est utilisée (moyenne pondérée par
// les effectifs des types d'établissement, d'après Stéphane, 20/10/2026).
// Poids du bilan CRF : ligne « Bilan CRF » du tableau (immobilisations =
// 2e poste, 21 %, confirmé le 20/10/2026) ; le bloc « Bilan CRF » à
// droite (M14:M21, utilisé par la formule L22 des fichiers des pôles)
// inverse achats de biens et immobilisations : écart signalé.
// Utilisée aussi pour les pôles pilotes (valeurs en kg), à la place de la
// réduction du catalogue seule (décision du 20/10/2026).
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
  // colonne des poids) : utilisé seulement si la ligne du tableau manque.
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
  result.national = mainNational || sideNational || {};
  result.nationalSource = mainNational ? 'ligne « Bilan CRF » du tableau' : (sideNational ? 'bloc « Bilan CRF » à droite du tableau' : '');
  if (!result.nationalSource) result.warnings.push('poids du bilan CRF introuvables');

  if (sideNational && mainNational) {
    const differing = posteCols
      .filter(({key}) => typeof sideNational[key] === 'number' && typeof mainNational[key] === 'number' &&
        Math.abs(sideNational[key] - mainNational[key]) > 0.05)
      .map(({key, label}) => `${label} ${mainNational[key]} % / ${sideNational[key]} %`);
    if (differing.length) {
      result.warnings.push(`poids du bilan CRF différents entre la ligne du tableau et le bloc de droite M14:M21 (${differing.join(' ; ')}) : ligne du tableau utilisée ; le bloc de droite sert aussi à la formule « Réduction carbone cible » des fichiers des pôles, à corriger`);
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

// Cible calculée (texte « -0,61% », comme les cibles saisies) ou '' si
// l'action n'a pas de réduction au catalogue, de poste connu ou si la
// filière est absente de « BDD - Bilan carbone ». Calculée pour toutes les
// lignes : le navigateur l'utilise quand la cible saisie est vide ou nulle,
// et pour les pôles pilotes.
function computeCibleCalculee_(fact, bilan) {
  if (!bilan) return '';
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
// Cible saisie absente ou nulle (« 0% », « 0,00 % ») : remplacée par la
// cible calculée.
function hasMissingTarget_(fact) {
  const value = parsePercentCell_(String(fact.reductionCible || '').replace(/−/g, '-'));
  return value === null || value === 0;
}

function testBilanCarbone() {
  const bootstrap = getDashboardBootstrap({forceRefresh: true});
  if (bootstrap.accessRequired) {
    Logger.log('Accès manquant au classeur national.');
    return;
  }
  Logger.log(JSON.stringify(bootstrap.diagnostics.details.bilanCarbone, null, 2));
}
