// Table de faits : une ligne = un couple pôle × action, lue dans la zone
// SYNTHESE de IMPORT DONNEES (colonnes AM:AZ, en-têtes en ligne 2 — voir
// Config.gs). Le mapping colonne dashboard -> en-tête source est celui du
// README.md.
function getFactRecords_() {
  const config = getConfig_();
  const table = readSheetTableInColumnRange_(
    config.SPREADSHEET_ID,
    config.IMPORT_SHEET_NAME,
    config.IMPORT_HEADER_ROW,
    config.IMPORT_SYNTHESE_FIRST_COLUMN,
    config.IMPORT_SYNTHESE_LAST_COLUMN
  );
  if (!table.rows.length) {
    addDiagnosticWarning_(`${config.IMPORT_SHEET_NAME} : aucune ligne lue dans la zone SYNTHESE.`);
    return [];
  }

  const columns = findFactColumns_(table, config.IMPORT_SHEET_NAME);
  return table.rows
    .map((row) => ({
      poleCode: cellAt_(row, columns.poleCode),
      action: cleanActionLabel_(cellAt_(row, columns.action)),
      volet: cellAt_(row, columns.volet),
      thematique: cellAt_(row, columns.thematique),
      avancement: cellAt_(row, columns.avancement),
      filiere: cellAt_(row, columns.filiere),
      actionSocle: cellAt_(row, columns.actionSocle),
      // Valeurs affichées brutes (ex. "-0,10%" ou "-59 700 kgCO2") :
      // l'unité est interprétée côté client (cf. parseReduction dans
      // Index.html et README.md, « Sujet ouvert : CO2 en kg/% »).
      reductionADate: cellAt_(row, columns.reductionADate),
      reductionCible: cellAt_(row, columns.reductionCible)
    }))
    .filter((fact) => fact.poleCode && fact.action);
}

function findFactColumns_(table, sheetLabel) {
  return {
    poleCode: findRequiredColumnIndex_(table, 'site', sheetLabel),
    action: findRequiredColumnIndex_(table, 'action envisagee', sheetLabel),
    volet: findRequiredColumnIndex_(table, 'type daction', sheetLabel),
    thematique: findRequiredColumnIndex_(table, 'poste demissions', sheetLabel),
    avancement: findRequiredColumnIndex_(table, 'avancement', sheetLabel),
    filiere: findRequiredColumnIndex_(table, 'filiere', sheetLabel),
    // Colonne "Action socles" (dernière colonne AZ) : distingue actions
    // socle (par année de campagne), actions filière et actions
    // supplémentaires — utilisée pour les coches "Actions socle" /
    // "Actions spécifiques filière". Optionnelle (classeurs plus anciens),
    // comme les deux colonnes de réduction carbone.
    actionSocle: findColumnIndex_(table, 'action socle'),
    reductionADate: findColumnIndex_(table, 'reduction carbone a date'),
    reductionCible: findColumnIndex_(table, 'reduction carbone cible')
  };
}

const INDICATOR_UNKNOWN_LABEL = 'Non renseigné(e)';
const PADOM_FILIERE_LABEL = 'PADOM';

// La filière et le territoire « officiels » d'un couple pôle × action
// viennent de BDD NOMS (via le code pôle), pas de la colonne Filière
// d'IMPORT DONNEES : les deux classent différemment certaines lignes (ex.
// "SANITAIRE" y est noté "SAN"). Repli sur la colonne du fait uniquement
// quand le pôle est introuvable dans BDD NOMS (ex. le pôle OUTRE-MER, dont
// le code est vide côté BDD NOMS — cf. README.md, "à corriger à la source").
//
// Cas particulier PADOM : BDD NOMS regroupe les pôles "PA" et "DOM" sous
// un seul libellé "PADOM", mais IMPORT DONNEES distingue les deux pour
// chaque pôle. Le classeur national affiche PA et DOM comme deux filières
// séparées, donc on réaffecte chaque pôle PADOM à "PA" ou "DOM" d'après ses
// propres lignes de faits (padomOverrides), jamais d'après une règle
// recalculée ici.
function resolveFactFiliere_(fact, poleReference, padomOverrides) {
  const pole = poleReference[normalizeText_(fact.poleCode)];
  if (pole && pole.filiere) {
    if (pole.filiere === PADOM_FILIERE_LABEL) {
      const override = padomOverrides[normalizeText_(fact.poleCode)];
      if (override) {
        return override;
      }
    }
    return pole.filiere;
  }
  return fact.filiere || INDICATOR_UNKNOWN_LABEL;
}

// Un pôle PADOM est reclassé "PA" ou "DOM" d'après la colonne Filière de ses
// propres lignes dans IMPORT DONNEES (vérifié : chaque pôle PADOM n'y
// apparaît jamais qu'avec l'une des deux valeurs, jamais les deux).
function derivePadomOverrides_(facts) {
  const overrides = {};
  facts.forEach((fact) => {
    if (fact.filiere === 'PA' || fact.filiere === 'DOM') {
      overrides[normalizeText_(fact.poleCode)] = fact.filiere;
    }
  });
  return overrides;
}

function resolveFactTerritoire_(fact, poleReference) {
  const pole = poleReference[normalizeText_(fact.poleCode)];
  return pole ? pole.territoire : '';
}

// Point d'entrée unique du front : un seul aller-retour au chargement de la
// page, tout le calcul (filtres, regroupements, taux) se fait ensuite côté
// client sur ces données déjà jointes. Avant, chaque changement de filtre
// relisait IMPORT DONNEES/BDD NOMS depuis zéro : c'était le principal frein
// de lenteur de l'application.
//
// Pas d'abstraction supplémentaire côté serveur au-delà de la jointure
// (filière/territoire résolus) : la logique des trois indicateurs (voir
// README.md et l'historique de leur vérification) ne vit qu'à un seul
// endroit, dans Index.html, plutôt que dupliquée en Apps Script ET en JS
// navigateur — un projet sans mainteneur dédié ne doit pas avoir deux
// versions de la même formule à garder synchronisées.
function getDashboardBootstrap() {
  // Même restriction de domaine que doGet (WebApp.gs) : cette fonction est
  // appelable depuis la page, elle ne doit rien renvoyer hors domaine.
  if (!isAllowedIdentityEmail_(getActiveUserEmail_())) {
    throw new Error('Accès réservé aux comptes @croix-rouge.fr.');
  }
  const config = getConfig_();
  DASHBOARD_DIAGNOSTICS_.warnings = [];
  DASHBOARD_DIAGNOSTICS_.details = {};
  const poleReference = getPoleReference_();
  const factRecords = getFactRecords_();
  const padomOverrides = derivePadomOverrides_(factRecords);
  const actionCatalogue = getActionCatalogue_();

  const facts = factRecords.map((fact) => ({
    poleCode: fact.poleCode,
    action: fact.action,
    volet: fact.volet,
    thematique: resolveFactThematique_(fact, actionCatalogue),
    avancement: fact.avancement,
    filiere: resolveFactFiliere_(fact, poleReference, padomOverrides),
    territoire: resolveFactTerritoire_(fact, poleReference),
    actionSocle: fact.actionSocle,
    reductionADate: fact.reductionADate,
    reductionCible: fact.reductionCible,
    // Réduction du catalogue pour cette action (valeur affichée brute, ex.
    // "-2,07%") : sert à recalculer les pôles pilotes quand l'option est
    // choisie dans la vue Détail par poste.
    catalogueReduction: resolveFactCatalogueReduction_(fact, actionCatalogue)
  }));

  // Le pôle lui-même (envoyé au client pour construire l'univers des pôles
  // par filière/territoire) doit refléter le même reclassement PADOM -> PA/DOM
  // que ses faits, sous peine d'incohérence entre "pôles attendus" et
  // "pôles avec des faits".
  const poles = Object.keys(poleReference).map((normalizedPoleCode) => {
    const pole = poleReference[normalizedPoleCode];
    if (pole.filiere === PADOM_FILIERE_LABEL) {
      const override = padomOverrides[normalizedPoleCode];
      if (override) {
        return Object.assign({}, pole, { filiere: override });
      }
    }
    return pole;
  });

  const withoutPole = {};
  facts.forEach((fact) => {
    if (!poleReference[normalizeText_(fact.poleCode)]) withoutPole[fact.poleCode] = true;
  });
  const missingCodes = Object.keys(withoutPole);
  setDiagnosticDetail_('faits', {lignes: facts.length, polesAbsentsDeBddNoms: missingCodes.slice(0, 20), nbPolesAbsents: missingCodes.length});
  if (missingCodes.length) {
    addDiagnosticWarning_(`${missingCodes.length} code(s) pôle d'${config.IMPORT_SHEET_NAME} absent(s) de ${config.POLE_REFERENCE_SHEET_NAME} (sans territoire), ex. ${missingCodes.slice(0, 3).join(', ')}.`);
  }

  const toolLinks = getToolLinks_();
  const history = getHistoryForDashboard_();
  return {
    appVersion: config.APP_VERSION,
    generatedAt: new Date().toISOString(),
    // Faits envoyés en colonnes (une liste de champs + des lignes) plutôt
    // qu'en objets : environ deux fois moins de données à transférer pour
    // ~7 000 lignes ; le navigateur reconstruit les objets (expandFacts).
    facts: toColumnar_(facts, FACT_FIELDS_),
    poles: poles,
    toolLinks: toolLinks,
    history: history,
    diagnostics: DASHBOARD_DIAGNOSTICS_
  };
}

const FACT_FIELDS_ = ['poleCode', 'action', 'volet', 'thematique', 'avancement', 'filiere', 'territoire', 'actionSocle', 'reductionADate', 'reductionCible', 'catalogueReduction'];

function toColumnar_(records, fields) {
  return {fields: fields, rows: records.map((record) => fields.map((field) => record[field]))};
}

// À exécuter depuis l'éditeur Apps Script en cas de doute sur un chiffre ou
// un affichage (ex. territoires absents) : affiche les avertissements et le
// détail des colonnes réellement utilisées, sans passer par l'appli.
function diagnosticDashboard() {
  const bootstrap = getDashboardBootstrap();
  Logger.log(JSON.stringify({
    avertissements: bootstrap.diagnostics.warnings,
    details: bootstrap.diagnostics.details,
    faits: bootstrap.facts.rows.length,
    poles: bootstrap.poles.length,
    historique: bootstrap.history.rows.length,
    liensOutils: bootstrap.toolLinks.length,
    tailleApproxKo: Math.round(JSON.stringify(bootstrap).length / 1024)
  }, null, 2));
}

// À exécuter manuellement depuis l'éditeur Apps Script pour éprouver la
// chaîne lecture -> jointure sur les vraies données (voir README.md :
// "Éprouver la chaîne complète... avant d'élargir"). Le résultat s'affiche
// dans le journal d'exécution (View > Logs) : compte des lignes et des
// pôles plutôt que le détail complet, pour rester lisible.
function testDashboardBootstrap() {
  const bootstrap = getDashboardBootstrap();
  Logger.log(JSON.stringify({
    appVersion: bootstrap.appVersion,
    factCount: bootstrap.facts.rows.length,
    poleCount: bootstrap.poles.length,
    sampleFact: bootstrap.facts.rows[0],
    samplePole: bootstrap.poles[0]
  }, null, 2));
}

// À exécuter manuellement depuis l'éditeur : recense les formats réellement
// présents dans les colonnes "Réduction carbone à date / cible" de la zone
// SYNTHESE (en %, en kg, vide, autre), pour vérifier que parseReduction
// (Index.html) couvre bien tous les cas avant de se fier aux chiffres.
function diagnosticReductionCarbone() {
  const facts = getFactRecords_();
  const classify = (value) => {
    const compact = String(value || '').replace(/[\s  ]/g, '');
    if (!compact) return 'vide';
    if (/kg/i.test(compact)) return 'kg';
    if (/^[+\-−]?\d+(?:[.,]\d+)?%$/.test(compact)) return '%';
    return 'autre';
  };
  const counts = {};
  const otherSamples = {};
  const kgPoles = {};
  facts.forEach((fact) => {
    ['reductionADate', 'reductionCible'].forEach((field) => {
      const kind = classify(fact[field]);
      const key = `${field} | ${kind}`;
      counts[key] = (counts[key] || 0) + 1;
      if (kind === 'autre' && Object.keys(otherSamples).length < 15) otherSamples[fact[field]] = true;
      if (kind === 'kg') kgPoles[fact.poleCode] = true;
    });
  });
  Logger.log(JSON.stringify({
    lignes: facts.length,
    formats: counts,
    exemplesAutres: Object.keys(otherSamples),
    polesAvecKg: Object.keys(kgPoles).sort()
  }, null, 2));
}
