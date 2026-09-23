// Trois indicateurs coexistent, chacun avec un usage différent (arbitrage
// remonté par l'utilisateur entre le directeur et Simon — les deux points de
// vue restent affichables plutôt que de trancher un seul indicateur) :
//
// 1. tauxTerminees        : # terminés (=100 %) / # concernés.
// 2. tauxMoyenAvancement  : moyenne des avancements parmi les concernés.
// 3. tauxReponse          : part des pôles de la filière ayant au moins un
//                            avancement non nul, parmi tous les pôles connus
//                            de la filière (pas seulement les concernés).
//
// Les points 1 et 3 sont vérifiés directement dans les formules du classeur
// national :
//   - onglets par filière (ex. SAN!J10/K10) :
//       # terminés  = COUNTIF(ligne action, "=100%")
//       # concernés = TOTAL structures de la filière - COUNTIF(ligne action, "=Abandonnée")
//     Le dénominateur exclut donc UNIQUEMENT les « Abandonnée » — les pôles à
//     0 % ou sans réponse restent comptés comme concernés.
//   - onglet "Traitement données" : un pôle est compté comme répondant dès
//     que la somme de ses avancements, tous couples pôle × action confondus,
//     est strictement positive (COUNTIFS(..., Somme de l'avancement <> 0)).
//     C'est un cumul depuis toujours, pas propre à une campagne : le
//     CLAUDE.md note que distinguer « s'est déjà servi de l'outil » de
//     « a répondu cette campagne » reste en attente d'arbitrage avec le
//     responsable de l'outil — ce chiffre mesure donc le premier, pas le
//     second.
//
// Le point 2 (« % moyen d'avancement ») n'a en revanche aucune formule
// vivante équivalente dans le classeur : l'onglet qui porte ce nom
// ("Evolution 2", "moyenne des avancements") pointe en fait vers des
// archives mensuelles du taux terminés/concernés (ex. ='Archives 0626'!L9)
// et n'est donc qu'une copie mal nommée du premier indicateur. La formule
// ci-dessous (moyenne des fractions d'avancement parmi les concernés) est
// donc une interprétation raisonnable, pas une valeur vérifiée contre une
// référence existante — à confirmer avec Simon si la précision compte.
const INDICATOR_EXCLUDED_AVANCEMENT = 'abandonnee';
const INDICATOR_DONE_AVANCEMENT = '100%';
const INDICATOR_UNKNOWN_FILIERE_LABEL = 'Filière non renseignée';

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

// La filière « officielle » d'un couple pôle × action vient de BDD NOMS (via
// le code pôle), pas de la colonne Filière d'IMPORT DONNEES : les deux
// classent différemment certaines lignes (ex. BDD NOMS regroupe "PA" et
// "DOM" sous "PADOM" ; "SANITAIRE" y est noté "SAN"). Repli sur la colonne
// du fait uniquement quand le pôle est introuvable dans BDD NOMS (ex. le
// pôle OUTRE-MER, dont le code est vide côté BDD NOMS — cf. CLAUDE.md,
// "à corriger à la source").
function resolveFactFiliere_(fact, poleReference) {
  const pole = poleReference[normalizeText_(fact.poleCode)];
  if (pole && pole.filiere) {
    return pole.filiere;
  }
  return fact.filiere || INDICATOR_UNKNOWN_FILIERE_LABEL;
}

function roundRate_(numerator, denominator) {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 1000) / 10;
}

// Premier livrable du CLAUDE.md, étendu aux trois indicateurs par filière
// (voir le commentaire en tête de fichier pour chaque formule et sa source).
//
// Certaines filières de BDD NOMS (ex. PROT ENFANCE) n'ont aucune ligne dans
// la zone SYNTHESE : leurs données sont alimentées autrement dans le
// classeur national (cf. CLAUDE.md, "pièges connus"). Ces filières
// apparaissent avec dataAvailable=false et les trois taux à null plutôt
// qu'un faux 0 %.
function getFiliereCompletionSnapshot() {
  const config = getConfig_();
  const facts = getFactRecords_();
  const poleReference = getPoleReference_();

  const byFiliere = {};
  const ensureFiliere = (name) => {
    if (!byFiliere[name]) {
      byFiliere[name] = {
        filiere: name,
        total: 0,
        concernes: 0,
        terminees: 0,
        sommeAvancementConcernes: 0
      };
    }
    return byFiliere[name];
  };

  const responseSumByPoleCode = {};

  facts.forEach((fact) => {
    const filiereName = resolveFactFiliere_(fact, poleReference);
    const bucket = ensureFiliere(filiereName);
    bucket.total += 1;
    if (isAvancementConcerne_(fact.avancement)) {
      bucket.concernes += 1;
      bucket.sommeAvancementConcernes += parseAvancementFraction_(fact.avancement);
      if (isAvancementTermine_(fact.avancement)) {
        bucket.terminees += 1;
      }
    }

    const normalizedPoleCode = normalizeText_(fact.poleCode);
    responseSumByPoleCode[normalizedPoleCode] =
      (responseSumByPoleCode[normalizedPoleCode] || 0) + parseAvancementFraction_(fact.avancement);
  });

  // Univers des pôles attendus par filière, tel que déclaré dans BDD NOMS.
  // Un pôle sans code (ex. OUTRE-MER, cf. CLAUDE.md) ne peut pas y figurer :
  // getPoleReference_ l'exclut déjà.
  const expectedPoleCodesByFiliere = {};
  Object.keys(poleReference).forEach((normalizedPoleCode) => {
    const pole = poleReference[normalizedPoleCode];
    if (!pole.filiere) {
      return;
    }
    if (!expectedPoleCodesByFiliere[pole.filiere]) {
      expectedPoleCodesByFiliere[pole.filiere] = [];
    }
    expectedPoleCodesByFiliere[pole.filiere].push(normalizedPoleCode);
    ensureFiliere(pole.filiere); // garantit une entrée même sans aucune ligne de fait.
  });

  const filieres = Object.keys(byFiliere)
    .sort((left, right) => left.localeCompare(right, 'fr'))
    .map((name) => {
      const bucket = byFiliere[name];
      const expectedPoleCodes = expectedPoleCodesByFiliere[name] || [];
      const nonRespondentPoles = expectedPoleCodes
        .filter((normalizedPoleCode) => (responseSumByPoleCode[normalizedPoleCode] || 0) === 0)
        .map((normalizedPoleCode) => poleReference[normalizedPoleCode]);
      const dataAvailable = bucket.total > 0;

      return {
        filiere: name,
        dataAvailable: dataAvailable,
        note: dataAvailable
          ? ''
          : 'Donnée non disponible depuis IMPORT DONNEES pour cette filière (alimentation différente dans le classeur national, cf. CLAUDE.md).',
        total: bucket.total,
        concernes: bucket.concernes,
        terminees: bucket.terminees,
        tauxTerminees: dataAvailable ? roundRate_(bucket.terminees, bucket.concernes) : null,
        tauxMoyenAvancement: dataAvailable ? roundRate_(bucket.sommeAvancementConcernes, bucket.concernes) : null,
        poleUniverseCount: expectedPoleCodes.length,
        nonRespondentPoleCount: nonRespondentPoles.length,
        tauxReponse: dataAvailable && expectedPoleCodes.length > 0
          ? roundRate_(expectedPoleCodes.length - nonRespondentPoles.length, expectedPoleCodes.length)
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
    filieres
  };
}

// À exécuter manuellement depuis l'éditeur Apps Script pour éprouver la
// chaîne lecture -> calcul sur les vraies données (voir CLAUDE.md :
// "Éprouver la chaîne complète... avant d'élargir"). Le résultat s'affiche
// dans le journal d'exécution (View > Logs).
function testFiliereCompletionSnapshot() {
  Logger.log(JSON.stringify(getFiliereCompletionSnapshot(), null, 2));
}
