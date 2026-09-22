// Valeurs d'avancement exclues du dénominateur (formule figée dans le
// CLAUDE.md : Taux = Σ(avancement = 100 %) ÷ Σ(avancement ∉ {0 %, Abandonnée})).
const INDICATOR_EXCLUDED_AVANCEMENT = ['0%', 'abandonnee'];
const INDICATOR_DONE_AVANCEMENT = '100%';

// Table de faits : une ligne = un couple pôle × action, lue dans la zone
// SYNTHESE de IMPORT DONNEES. Le mapping colonne dashboard -> en-tête source
// est celui du CLAUDE.md ; PADOM et PROT ENFANCE ont une structure différente
// dans le national (renvois de cellule au lieu de COUNTIF) et n'ont pas
// encore été vérifiés avec des données réelles : à recontrôler en priorité
// si leur taux paraît aberrant.
function getFactRecords_() {
  const config = getConfig_();
  const records = readSheetRecords_(
    config.SPREADSHEET_ID,
    config.IMPORT_SHEET_NAME,
    config.HEADER_ROW,
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
    const filiereName = fact.filiere || 'Filière non renseignée';
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
  });

  const filieres = Object.keys(byFiliere)
    .sort((left, right) => left.localeCompare(right, 'fr'))
    .map((name) => {
      const bucket = byFiliere[name];
      const expectedPoleCodes = expectedPoleCodesByFiliere[name] || [];
      const nonRespondentPoles = expectedPoleCodes
        .filter((normalizedPoleCode) => !bucket.respondingPoleCodes[normalizedPoleCode])
        .map((normalizedPoleCode) => poleReference[normalizedPoleCode]);

      return {
        filiere: name,
        total: bucket.total,
        concernes: bucket.concernes,
        terminees: bucket.terminees,
        rate: bucket.concernes === 0
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
