// Valeurs d'avancement exclues du dénominateur (formule figée dans le
// CLAUDE.md : Taux = Σ(avancement = 100 %) ÷ Σ(avancement ∉ {0 %, Abandonnée})).
const INDICATOR_EXCLUDED_AVANCEMENT = ['0%', 'abandonnee'];
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
  const normalized = normalizeAvancementValue_(avancement);
  return normalized !== '' && INDICATOR_EXCLUDED_AVANCEMENT.indexOf(normalized) === -1;
}

function isAvancementTermine_(avancement) {
  return normalizeAvancementValue_(avancement) === normalizeAvancementValue_(INDICATOR_DONE_AVANCEMENT);
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

// Premier livrable du CLAUDE.md : % terminées par filière + ligne de qualité
// (pôles de la filière absents de toute réponse concernée).
//
// La définition de « pôle qui n'a pas répondu » est provisoire : elle
// compte comme non répondant tout pôle de BDD NOMS dont aucune ligne de
// IMPORT DONNEES n'est « concernée » (cf. isAvancementConcerne_). Le
// CLAUDE.md note explicitement que la définition de « a répondu cette
// campagne » reste à valider avec le responsable de l'outil (section
// « En attente ») : ce chiffre est donc à confirmer avec lui avant
// diffusion, pas un résultat déjà validé.
//
// Certaines filières de BDD NOMS (ex. PROT ENFANCE) n'ont aucune ligne dans
// la zone SYNTHESE : leurs données sont alimentées autrement dans le
// classeur national (cf. CLAUDE.md, "pièges connus"). Ces filières
// apparaissent avec dataAvailable=false plutôt qu'un faux taux de 0 %.
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
        respondingPoleCodes: {}
      };
    }
    return byFiliere[name];
  };

  facts.forEach((fact) => {
    const filiereName = resolveFactFiliere_(fact, poleReference);
    const bucket = ensureFiliere(filiereName);
    bucket.total += 1;
    if (isAvancementConcerne_(fact.avancement)) {
      bucket.concernes += 1;
      bucket.respondingPoleCodes[normalizeText_(fact.poleCode)] = true;
      if (isAvancementTermine_(fact.avancement)) {
        bucket.terminees += 1;
      }
    }
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
        .filter((normalizedPoleCode) => !bucket.respondingPoleCodes[normalizedPoleCode])
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
        rate: !dataAvailable
          ? null
          : bucket.concernes === 0
            ? 0
            : Math.round((bucket.terminees / bucket.concernes) * 1000) / 10,
        nonRespondentPoleCount: nonRespondentPoles.length,
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
