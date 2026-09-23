// Trois indicateurs coexistent, chacun avec un usage différent (arbitrage
// remonté par l'utilisateur entre le directeur et Simon — les deux points de
// vue restent affichables plutôt que de trancher un seul indicateur) :
//
// 1. tauxTerminees        : # terminés (=100 %) / # concernés.
// 2. tauxMoyenAvancement  : moyenne des avancements parmi les concernés.
// 3. tauxReponse          : part des pôles du groupe ayant au moins un
//                            avancement non nul, parmi tous les pôles connus
//                            de ce groupe (pas seulement les concernés).
//
// Les points 1 et 3 sont vérifiés directement dans les formules du classeur
// national :
//   - onglets par filière (ex. SAN!J10/K10) :
//       # terminés  = COUNTIF(ligne action, "=100%")
//       # concernés = TOTAL structures de la filière - COUNTIF(ligne action, "=Abandonnée")
//     Le dénominateur exclut donc UNIQUEMENT les « Abandonnée » — les pôles à
//     0 % ou sans réponse restent comptés comme concernés.
//   - onglet "Traitement données" : un pôle est compté comme répondant dès
//     que la somme de ses avancements est strictement positive
//     (COUNTIFS(..., Somme de l'avancement <> 0)). C'est un cumul depuis
//     toujours, pas propre à une campagne : le CLAUDE.md note que distinguer
//     « s'est déjà servi de l'outil » de « a répondu cette campagne » reste
//     en attente d'arbitrage avec le responsable de l'outil — ce chiffre
//     mesure donc le premier, pas le second.
//
// Le point 2 (« % moyen d'avancement ») n'a en revanche aucune formule
// vivante équivalente dans le classeur nationale : l'onglet qui porte ce nom
// ("Evolution 2", "moyenne des avancements") pointe en fait vers des
// archives mensuelles du taux terminés/concernés (ex. ='Archives 0626'!L9)
// et n'est donc qu'une copie mal nommée du premier indicateur. La formule
// ci-dessous (moyenne des fractions d'avancement parmi les concernés) est
// donc une interprétation raisonnable, pas une valeur vérifiée contre une
// référence existante — à confirmer avec Simon si la précision compte.
const INDICATOR_EXCLUDED_AVANCEMENT = 'abandonnee';
const INDICATOR_DONE_AVANCEMENT = '100%';
const INDICATOR_UNKNOWN_LABEL = 'Non renseigné(e)';
const INDICATOR_NIVEAUX = ['filiere', 'thematique', 'volet', 'action'];

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

// Le Sheet écrit parfois « 100 % » avec une espace avant le signe : on la
// retire avant comparaison pour ne pas dépendre de cette mise en forme.
function normalizeAvancementValue_(value) {
  return normalizeText_(value).replace(/\s+/g, '');
}

function isAvancementConcerne_(avancement) {
  return normalizeAvancementValue_(avancement) !== INDICATOR_EXCLUDED_AVANCEMENT;
}

function isAvancementTermine_(avancement) {
  return normalizeAvancementValue_(avancement) === normalizeAvancementValue_(INDICATOR_DONE_AVANCEMENT);
}

// Convertit l'avancement affiché ("20%", "100%"...) en fraction numérique ;
// renvoie 0 pour tout ce qui n'est pas un pourcentage (Abandonnée, vide,
// #N/A). Reproduit le comportement de SUMIFS/AVERAGEIFS sur la colonne
// Avancement dans l'onglet "Traitement données" du classeur national, qui
// ignore les cellules non numériques.
function parseAvancementFraction_(avancement) {
  const match = normalizeAvancementValue_(avancement).match(/^(\d+(?:\.\d+)?)%$/);
  return match ? Number(match[1]) / 100 : 0;
}

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

function roundRate_(numerator, denominator) {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 1000) / 10;
}

// Pôles connus de BDD NOMS pour une filière (et, si précisé, un territoire) :
// c'est l'univers utilisé pour la ligne de qualité / tauxReponse. Un pôle
// sans code (ex. OUTRE-MER, cf. CLAUDE.md) ne peut pas y figurer :
// getPoleReference_ l'exclut déjà.
function getPoleUniverseCodes_(poleReference, filiereName, territoireName) {
  return Object.keys(poleReference).filter((normalizedPoleCode) => {
    const pole = poleReference[normalizedPoleCode];
    if (!pole.filiere || pole.filiere !== filiereName) {
      return false;
    }
    if (territoireName && pole.territoire !== territoireName) {
      return false;
    }
    return true;
  });
}

// Liste les filières et, pour chacune, ses territoires connus (BDD NOMS) —
// sert à peupler les filtres du front sans coder ces valeurs en dur (cf.
// CLAUDE.md : "tout ce qui varie vit dans un Sheet").
function getFilterOptions() {
  const poleReference = getPoleReference_();
  const territoiresByFiliere = {};

  Object.keys(poleReference).forEach((normalizedPoleCode) => {
    const pole = poleReference[normalizedPoleCode];
    if (!pole.filiere) {
      return;
    }
    if (!territoiresByFiliere[pole.filiere]) {
      territoiresByFiliere[pole.filiere] = {};
    }
    if (pole.territoire) {
      territoiresByFiliere[pole.filiere][pole.territoire] = true;
    }
  });

  const filieres = Object.keys(territoiresByFiliere).sort((left, right) => left.localeCompare(right, 'fr'));
  const result = {};
  filieres.forEach((name) => {
    result[name] = Object.keys(territoiresByFiliere[name]).sort((left, right) => left.localeCompare(right, 'fr'));
  });

  return {filieres: filieres, territoiresByFiliere: result};
}

// Moteur de calcul générique derrière les deux vues du dashboard :
// - niveau = 'filiere' (défaut), pas de filière choisie -> une ligne par
//   filière (le premier livrable du CLAUDE.md, "% terminées par filière").
// - filière choisie (+ éventuellement territoire) -> les lignes deviennent
//   les valeurs du niveau choisi (thematique / volet / action) au sein de ce
//   périmètre.
//
// Certains groupes peuvent n'avoir aucune ligne de fait dans IMPORT DONNEES
// (ex. la filière PROT ENFANCE, alimentée autrement dans le classeur
// national — cf. CLAUDE.md, "pièges connus") : ils apparaissent avec
// dataAvailable=false et les trois taux à null plutôt qu'un faux 0 %.
function getCompletionSnapshot(options) {
  const opts = options || {};
  const config = getConfig_();
  const poleReference = getPoleReference_();

  const scopeFiliere = cleanValue_(opts.filiere);
  const scopeTerritoire = scopeFiliere ? cleanValue_(opts.territoire) : '';
  const requestedNiveau = cleanValue_(opts.niveau);
  const niveau = INDICATOR_NIVEAUX.indexOf(requestedNiveau) !== -1 ? requestedNiveau : 'filiere';

  const scopedFacts = getFactRecords_()
    .map((fact) => Object.assign({}, fact, {
      resolvedFiliere: resolveFactFiliere_(fact, poleReference),
      resolvedTerritoire: resolveFactTerritoire_(fact, poleReference)
    }))
    .filter((fact) => {
      if (scopeFiliere && fact.resolvedFiliere !== scopeFiliere) {
        return false;
      }
      if (scopeFiliere && scopeTerritoire && fact.resolvedTerritoire !== scopeTerritoire) {
        return false;
      }
      return true;
    });

  const groupKeyOf = (fact) => {
    if (niveau === 'thematique') return fact.thematique || INDICATOR_UNKNOWN_LABEL;
    if (niveau === 'volet') return fact.volet || INDICATOR_UNKNOWN_LABEL;
    if (niveau === 'action') return fact.action || INDICATOR_UNKNOWN_LABEL;
    return fact.resolvedFiliere;
  };

  const byGroup = {};
  const ensureGroup = (name) => {
    if (!byGroup[name]) {
      byGroup[name] = {
        name: name,
        total: 0,
        concernes: 0,
        terminees: 0,
        sommeAvancementConcernes: 0,
        responseSumByPoleCode: {}
      };
    }
    return byGroup[name];
  };

  scopedFacts.forEach((fact) => {
    const bucket = ensureGroup(groupKeyOf(fact));
    bucket.total += 1;
    const fraction = parseAvancementFraction_(fact.avancement);
    if (isAvancementConcerne_(fact.avancement)) {
      bucket.concernes += 1;
      bucket.sommeAvancementConcernes += fraction;
      if (isAvancementTermine_(fact.avancement)) {
        bucket.terminees += 1;
      }
    }
    const normalizedPoleCode = normalizeText_(fact.poleCode);
    bucket.responseSumByPoleCode[normalizedPoleCode] =
      (bucket.responseSumByPoleCode[normalizedPoleCode] || 0) + fraction;
  });

  // Niveau "filiere" sans filière imposée : un groupe = une filière. On
  // garantit une entrée par filière connue de BDD NOMS même sans ligne de
  // fait (ex. PROT ENFANCE), pour ne jamais la faire disparaître en silence.
  if (niveau === 'filiere' && !scopeFiliere) {
    Object.keys(poleReference).forEach((normalizedPoleCode) => {
      const pole = poleReference[normalizedPoleCode];
      if (pole.filiere) {
        ensureGroup(pole.filiere);
      }
    });
  }

  const groups = Object.keys(byGroup)
    .sort((left, right) => left.localeCompare(right, 'fr'))
    .map((name) => {
      const bucket = byGroup[name];
      // L'univers de pôles (pour tauxReponse / ligne de qualité) suit la
      // filière du groupe lui-même quand niveau=filiere (chaque filière a
      // ses propres pôles), sinon celle du périmètre choisi (thematique /
      // volet / action ne partitionnent pas les pôles, seulement les
      // actions).
      const universeFiliere = niveau === 'filiere' ? name : scopeFiliere;
      const universeTerritoire = niveau === 'filiere' ? '' : scopeTerritoire;
      const poleUniverseCodes = universeFiliere
        ? getPoleUniverseCodes_(poleReference, universeFiliere, universeTerritoire)
        : [];
      const nonRespondentPoles = poleUniverseCodes
        .filter((code) => (bucket.responseSumByPoleCode[code] || 0) === 0)
        .map((code) => poleReference[code]);
      const dataAvailable = bucket.total > 0;

      return {
        label: name,
        dataAvailable: dataAvailable,
        note: dataAvailable
          ? ''
          : 'Donnée non disponible depuis IMPORT DONNEES pour ce groupe (alimentation différente dans le classeur national, cf. CLAUDE.md).',
        total: bucket.total,
        concernes: bucket.concernes,
        terminees: bucket.terminees,
        tauxTerminees: dataAvailable ? roundRate_(bucket.terminees, bucket.concernes) : null,
        tauxMoyenAvancement: dataAvailable ? roundRate_(bucket.sommeAvancementConcernes, bucket.concernes) : null,
        poleUniverseCount: poleUniverseCodes.length,
        nonRespondentPoleCount: nonRespondentPoles.length,
        tauxReponse: dataAvailable && poleUniverseCodes.length > 0
          ? roundRate_(poleUniverseCodes.length - nonRespondentPoles.length, poleUniverseCodes.length)
          : null,
        nonRespondentPoles: nonRespondentPoles.map((pole) => ({
          poleCode: pole.poleCode,
          label: pole.label
        }))
      };
    });

  return {
    appVersion: config.APP_VERSION,
    generatedAt: new Date().toISOString(),
    filiere: scopeFiliere,
    territoire: scopeTerritoire,
    niveau: niveau,
    groups: groups
  };
}

// Vue « détail pôle × action » (le minimum demandé : reproduire le type de
// tableau du bilan territorial existant — pôles en colonnes, actions en
// lignes, avancement brut par cellule). Contrairement à
// getCompletionSnapshot_, aucune agrégation : chaque cellule est la valeur
// telle que lue dans IMPORT DONNEES.
function getPoleActionMatrix(filiere, territoire) {
  const scopeFiliere = cleanValue_(filiere);
  const scopeTerritoire = cleanValue_(territoire);
  if (!scopeFiliere || !scopeTerritoire) {
    throw new Error('Choisissez une filière et un territoire pour afficher le détail.');
  }

  const poleReference = getPoleReference_();
  const scopedFacts = getFactRecords_()
    .map((fact) => Object.assign({}, fact, {
      resolvedFiliere: resolveFactFiliere_(fact, poleReference),
      resolvedTerritoire: resolveFactTerritoire_(fact, poleReference)
    }))
    .filter((fact) => fact.resolvedFiliere === scopeFiliere && fact.resolvedTerritoire === scopeTerritoire);

  const poleCodesInOrder = [];
  const poleSeen = {};
  const actionsInOrder = [];
  const actionSeen = {};
  const cellByActionAndPole = {};
  const CELL_KEY_SEPARATOR = '\u0001';

  scopedFacts.forEach((fact) => {
    const normalizedPoleCode = normalizeText_(fact.poleCode);
    if (!poleSeen[normalizedPoleCode]) {
      poleSeen[normalizedPoleCode] = true;
      poleCodesInOrder.push(normalizedPoleCode);
    }
    if (!actionSeen[fact.action]) {
      actionSeen[fact.action] = true;
      actionsInOrder.push(fact.action);
    }
    cellByActionAndPole[fact.action + CELL_KEY_SEPARATOR + normalizedPoleCode] = fact.avancement;
  });

  const poles = poleCodesInOrder.map((normalizedPoleCode) => {
    const pole = poleReference[normalizedPoleCode];
    return {
      poleCode: pole ? pole.poleCode : normalizedPoleCode,
      label: pole ? pole.label : ''
    };
  });

  const rows = actionsInOrder.map((action) => ({
    action: action,
    cells: poleCodesInOrder.map((normalizedPoleCode) =>
      cellByActionAndPole[action + CELL_KEY_SEPARATOR + normalizedPoleCode] || ''
    )
  }));

  return {
    filiere: scopeFiliere,
    territoire: scopeTerritoire,
    poles: poles,
    rows: rows
  };
}

// À exécuter manuellement depuis l'éditeur Apps Script pour éprouver la
// chaîne lecture -> calcul sur les vraies données (voir CLAUDE.md :
// "Éprouver la chaîne complète... avant d'élargir"). Le résultat s'affiche
// dans le journal d'exécution (View > Logs).
function testCompletionSnapshot() {
  Logger.log(JSON.stringify(getCompletionSnapshot({}), null, 2));
}
