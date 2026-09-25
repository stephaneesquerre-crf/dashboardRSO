// Table de faits : une ligne = un couple pôle × action, lue dans la zone
// SYNTHESE de IMPORT DONNEES (colonnes AM:AZ, en-têtes en ligne 2 — voir
// Config.gs). Le mapping colonne dashboard -> en-tête source est celui du
// README.md.
function getFactRecords_() {
  const config = getConfig_();
  const records = readSheetRecordsInColumnRange_(
    config.SPREADSHEET_ID,
    config.IMPORT_SHEET_NAME,
    config.IMPORT_HEADER_ROW,
    config.IMPORT_SYNTHESE_FIRST_COLUMN,
    config.IMPORT_SYNTHESE_LAST_COLUMN
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
      filiere: cleanValue_(record[columns.filiere]),
      actionSocle: cleanValue_(record[columns.actionSocle])
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
    filiere: findHeader_(headers, 'filiere'),
    // Colonne "Action socles" (dernière colonne AZ) : distingue actions
    // socle (par année de campagne), actions filière et actions
    // supplémentaires — cf. diagnosticActionSocles et Index.html, utilisé
    // pour la coche "actions actuellement suivies". Optionnelle : un
    // classeur plus ancien peut ne pas avoir cette colonne.
    actionSocle: findOptionalHeader_(headers, 'action socle')
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
  const config = getConfig_();
  const poleReference = getPoleReference_();
  const factRecords = getFactRecords_();
  const padomOverrides = derivePadomOverrides_(factRecords);

  const facts = factRecords.map((fact) => ({
    poleCode: fact.poleCode,
    action: fact.action,
    volet: fact.volet,
    thematique: fact.thematique,
    avancement: fact.avancement,
    filiere: resolveFactFiliere_(fact, poleReference, padomOverrides),
    territoire: resolveFactTerritoire_(fact, poleReference),
    actionSocle: fact.actionSocle
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

  return {
    appVersion: config.APP_VERSION,
    generatedAt: new Date().toISOString(),
    facts: facts,
    poles: poles
  };
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
    factCount: bootstrap.facts.length,
    poleCount: bootstrap.poles.length,
    sampleFact: bootstrap.facts[0],
    samplePole: bootstrap.poles[0]
  }, null, 2));
}
