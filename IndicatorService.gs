// Table de faits : une ligne = un couple pôle × action, lue dans la zone
// SYNTHESE de IMPORT DONNEES (colonnes AM:AZ, en-têtes en ligne 2 — voir
// Config.gs). Le mapping colonne dashboard -> en-tête source est celui du
// CLAUDE.md.
function getFactRecords_() {
  const config = getConfig_();
  const records = readSheetRecordsInColumnRange_(
    config.SPREADSHEET_ID,
    config.IMPORT_SHEET_NAME,
    config.IMPORT_HEADER_ROW,
    config.IMPORT_SYNTHESE_FIRST_COLUMN,
    config.IMPORT_SYNTHESE_LAST_COLUMN,
    config.MAX_DASHBOARD_ROWS
  );

  if (records.length === 0) {
    return [];
  }

  const columns = findFactColumns_(Object.keys(records[0]));

  return records
    .map((record) => ({
      poleCode: cleanValue_(record[columns.poleCode]),
      action: cleanValue_(record[columns.action]),
      volet: cleanValue_(record[columns.volet]),
      thematique: cleanValue_(record[columns.thematique]),
      avancement: cleanValue_(record[columns.avancement]),
      filiere: cleanValue_(record[columns.filiere])
    }))
    .filter((fact) => fact.poleCode && fact.action);
}

function findFactColumns_(headers) {
  return {
    poleCode: findHeader_(headers, 'site'),
    action: findHeader_(headers, 'action envisagee'),
    volet: findHeader_(headers, 'type daction'),
    thematique: findHeader_(headers, 'poste demissions'),
    avancement: findHeader_(headers, 'avancement'),
    filiere: findHeader_(headers, 'filiere')
  };
}

const INDICATOR_UNKNOWN_LABEL = 'Non renseigné(e)';

// La filière et le territoire « officiels » d'un couple pôle × action
// viennent de BDD NOMS (via le code pôle), pas de la colonne Filière
// d'IMPORT DONNEES : les deux classent différemment certaines lignes (ex.
// BDD NOMS regroupe "PA" et "DOM" sous "PADOM" ; "SANITAIRE" y est noté
// "SAN"). Repli sur la colonne du fait uniquement quand le pôle est
// introuvable dans BDD NOMS (ex. le pôle OUTRE-MER, dont le code est vide
// côté BDD NOMS — cf. CLAUDE.md, "à corriger à la source").
function resolveFactFiliere_(fact, poleReference) {
  const pole = poleReference[normalizeText_(fact.poleCode)];
  if (pole && pole.filiere) {
    return pole.filiere;
  }
  return fact.filiere || INDICATOR_UNKNOWN_LABEL;
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
// CLAUDE.md et l'historique de leur vérification) ne vit qu'à un seul
// endroit, dans Index.html, plutôt que dupliquée en Apps Script ET en JS
// navigateur — un projet sans mainteneur dédié ne doit pas avoir deux
// versions de la même formule à garder synchronisées.
function getDashboardBootstrap() {
  const config = getConfig_();
  const poleReference = getPoleReference_();

  const facts = getFactRecords_().map((fact) => ({
    poleCode: fact.poleCode,
    action: fact.action,
    volet: fact.volet,
    thematique: fact.thematique,
    avancement: fact.avancement,
    filiere: resolveFactFiliere_(fact, poleReference),
    territoire: resolveFactTerritoire_(fact, poleReference)
  }));

  const poles = Object.keys(poleReference).map((normalizedPoleCode) => poleReference[normalizedPoleCode]);

  return {
    appVersion: config.APP_VERSION,
    generatedAt: new Date().toISOString(),
    facts: facts,
    poles: poles
  };
}

// À exécuter manuellement depuis l'éditeur Apps Script pour éprouver la
// chaîne lecture -> jointure sur les vraies données (voir CLAUDE.md :
// "Éprouver la chaîne complète... avant d'élargir"). Le résultat s'affiche
// dans le journal d'exécution (View > Logs) : compte des lignes et des
// pôles plutôt que le détail complet, pour rester lisible.
function testDashboardBootstrap() {
  const bootstrap = getDashboardBootstrap();
  Logger.log(JSON.stringify({
    appVersion: bootstrap.appVersion,
    factCount: bootstrap.facts.length,
    poleCount: bootstrap.poles.length,
    sampleFact: bootstrap.facts[0],
    samplePole: bootstrap.poles[0]
  }, null, 2));
}
