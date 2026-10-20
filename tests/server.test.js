// Tests de la partie serveur (Apps Script exécuté dans Node).
// Lancer : npm test (depuis la racine du dépôt).
const test = require('node:test');
const assert = require('node:assert');
const {loadAppsScript} = require('./harness');
const {NATIONAL_ID, ARCHIVES_ID, REFERENTS_ID, FILIERES, buildNational, buildArchives, buildReferents, buildProtEnfance} = require('./fixtures');

// Service avancé Sheets simulé : onglet « Liens outils référents » (B:F).
const chip = (title, uri) => ({formattedValue: title, chipRuns: [{chip: {richLinkProperties: {uri}}}]});
const SHEETS_API = {Spreadsheets: {get: () => ({sheets: [{data: [{rowData: [
  {values: [{formattedValue: 'Outils A4T'}, {formattedValue: 'Code FILIERE'}, {formattedValue: 'Liens outils'}, {formattedValue: 'Liens outils bis'}, {formattedValue: 'Liens référents'}]},
  {values: [{formattedValue: 'Outil CRC'}, {formattedValue: 'CRC'}, chip('OUTIL DE SUIVI v2 - CRC', 'https://docs.google.com/x'), {}, chip('CRC_Liste référents', `https://docs.google.com/spreadsheets/d/${REFERENTS_ID}/edit`)]},
  {values: [{formattedValue: 'Outils non utilisés'}]},
  {values: [{formattedValue: 'Outil CRC ancien'}, {formattedValue: 'CRC'}, chip('Ancien outil', 'https://docs.google.com/old')]}
]}]}]})}};

function bootstrapFor(variant, options) {
  const app = loadAppsScript({[NATIONAL_ID]: buildNational(variant), [ARCHIVES_ID]: buildArchives(), [REFERENTS_ID]: buildReferents()}, options);
  return {app, bootstrap: app.getDashboardBootstrap()};
}

function territoriesByFiliere(bootstrap) {
  const result = {};
  bootstrap.poles.forEach((pole) => {
    result[pole.filiere] = result[pole.filiere] || new Set();
    if (pole.territoire) result[pole.filiere].add(pole.territoire);
  });
  return Object.fromEntries(Object.entries(result).map(([key, set]) => [key, [...set].sort()]));
}

for (const variant of ['normal', 'territoireEnDouble', 'territoireVideAvant']) {
  test(`territoires présents pour chaque filière (BDD NOMS ${variant})`, () => {
    const {bootstrap} = bootstrapFor(variant);
    const territories = territoriesByFiliere(bootstrap);
    Object.entries(FILIERES).forEach(([filiere, expected]) => {
      assert.deepStrictEqual(territories[filiere], [...expected].sort(), `filière ${filiere}`);
    });
    const territoireField = bootstrap.facts.fields.indexOf('territoire');
    assert.ok(bootstrap.facts.rows.every((row) => row[territoireField]), 'chaque fait a un territoire');
  });
}

test('colonne Territoire absente : avertissement explicite', () => {
  const {bootstrap} = bootstrapFor('sansTerritoire');
  assert.ok(bootstrap.diagnostics.warnings.some((w) => /Territoire/.test(w)), bootstrap.diagnostics.warnings.join(' | '));
});

test('zone SYNTHESE seule lue (AM:AZ), préfixe « Action socle - » retiré', () => {
  const {bootstrap} = bootstrapFor('normal');
  const actionField = bootstrap.facts.fields.indexOf('action');
  const actions = new Set(bootstrap.facts.rows.map((row) => row[actionField]));
  assert.ok(actions.has('Ecoconduite'));
  assert.ok(!actions.has('Action socle - Ecoconduite'));
  assert.ok(!actions.has('NE PAS LIRE'));
});

test('poste et réduction du catalogue repris du référentiel', () => {
  const {bootstrap} = bootstrapFor('normal');
  const fields = bootstrap.facts.fields;
  const row = bootstrap.facts.rows.find((r) => r[fields.indexOf('action')] === 'Repas végétariens');
  assert.strictEqual(row[fields.indexOf('thematique')], 'Achats de biens');
  assert.strictEqual(row[fields.indexOf('catalogueReduction')], '-2,07%');
});

test('historique : mois relu comme date ramené à AAAA-MM', () => {
  const {bootstrap} = bootstrapFor('normal');
  const months = bootstrap.history.rows.map((row) => row[0]).sort();
  assert.deepStrictEqual(months, ['2026-08', '2026-09']);
});

test('accès refusé hors domaine croix-rouge.fr', () => {
  const app = loadAppsScript({[NATIONAL_ID]: buildNational('normal')}, {email: 'quelquun@gmail.com'});
  assert.throws(() => app.getDashboardBootstrap(), /réservé/);
});

test('import des archives : nouvelle et ancienne mise en page', () => {
  const {app} = bootstrapFor('normal');
  const modern = [
    ['', '', '', '', 'TOTAL', 'SANITAIRE'],
    ['', '', 'Nombre total de structures', '', 20, 19],
    ['', '', 'Nombre de structures ayant répondu', '', 18, 17],
    ['', '', 'TX DE TERMINES PARMIS LES CONCERNES', '', '', 'SANITAIRE'],
    ['', '', '', '', 'TOTAL', '%', '# terminés', '# réponses concernés'],
    ['', 'Actions socles 2024', 'Repas végétariens', '', 0.5, 0.6, 6, 10],
    ['', '', 'Voitures électriques', 'Indic. DIP', '', 0, 0, 60],
    ['', '', '', '', '', '', '', '']
  ];
  const parsed = app.parseArchiveValues_(modern, 'Archives 09/26');
  assert.strictEqual(parsed.month, '2026-09');
  assert.ok(parsed.rows.some((r) => r[3] === 'Repas végétariens' && r[5] === 'SAN' && r[6] === 'terminees' && r[7] === 6));
  assert.ok(!parsed.rows.some((r) => r[3] === 'Voitures électriques'), 'indicateurs DIP écartés');
  assert.ok(parsed.rows.some((r) => r[6] === 'nbRepondants' && r[5] === 'SAN' && r[7] === 17));
  assert.strictEqual(app.archiveMonthFromName_('Archives 01/26 2'), '2026-01');
});

test('lancerTests() (Tests.gs) passe sur les classeurs simulés', () => {
  const app = loadAppsScript({[NATIONAL_ID]: buildNational('normal'), [ARCHIVES_ID]: buildArchives(), [REFERENTS_ID]: buildReferents()}, {sheetsApi: SHEETS_API});
  const summary = app.lancerTests();
  assert.strictEqual(summary.echecs, 0, app.__logs.join('\n'));
});

test('actualisation automatique : réécrit l\'historique seulement si les archives changent', () => {
  const archives = buildArchives();
  archives['Archives 09/26'] = [
    ['', '', '', '', 'TOTAL', 'SANITAIRE'],
    ['', '', 'TX DE TERMINES PARMIS LES CONCERNES', '', '', 'SANITAIRE'],
    ['', '', '', '', 'TOTAL', '%', '# terminés', '# réponses concernés'],
    ['', 'Actions socles 2024', 'Repas végétariens', '', 0.5, 0.6, 6, 10],
    ['', '', '', '', '', '', '', '']
  ];
  const app = loadAppsScript({[NATIONAL_ID]: buildNational('normal'), [ARCHIVES_ID]: archives});
  assert.strictEqual(app.actualiserHistoriqueSiModifie(), true, 'premier passage : import');
  assert.strictEqual(app.actualiserHistoriqueSiModifie(), false, 'archives inchangées : rien');
  const sheet = app.__spreadsheets[ARCHIVES_ID].getSheetByName('Archives 09/26');
  sheet.values[3][6] = 7;
  assert.strictEqual(app.actualiserHistoriqueSiModifie(), true, 'valeur corrigée : réimport');
  const history = app.getHistoryForDashboard_();
  assert.ok(history.refreshedAt, 'date d\'actualisation transmise');
  assert.ok(history.rows.some((row) => row[2] === 'Repas végétariens' && row[3] === 'SAN' && row[4] === 'terminees' && row[5] === 7));
});

test('protection de l\'enfance : onglet PROT ENFANCE lu (codes pôle, campagne reprise, décalage toléré)', () => {
  const {bootstrap} = bootstrapFor('normal');
  const fields = bootstrap.facts.fields;
  const get = (row, name) => row[fields.indexOf(name)];
  const prot = bootstrap.facts.rows.filter((row) => get(row, 'filiere') === 'PROT ENFANCE');
  const repas = prot.filter((row) => get(row, 'action') === 'Repas végétariens');
  assert.strictEqual(repas.length, 4);
  assert.deepStrictEqual([...new Set(repas.map((row) => get(row, 'avancement')))].sort(), ['100%', '40%']);
  assert.ok(repas.every((row) => get(row, 'actionSocle') === 'Action socle 2024'), 'campagne reprise des autres filières');
  assert.ok(prot.some((row) => get(row, 'action') === 'Bornes électriques' && get(row, 'avancement') === 'Abandonnée'));
  assert.ok(prot.every((row) => get(row, 'territoire')), 'territoire via BDD NOMS');
  assert.ok(!prot.some((row) => /Suivi actualisé/.test(get(row, 'action'))), 'tableau brut non lu comme actions');

  const app = loadAppsScript({});
  const reference = {};
  buildNational('normal')['BDD NOMS'].slice(1).forEach((row) => { reference[app.normalizeText_(row[0])] = {}; });
  const shifted = app.parseProtEnfanceValues_(buildProtEnfance(3), reference);
  assert.strictEqual(shifted.actionCount, 3);
  assert.strictEqual(shifted.rows.length, 8);
});

test('liens : outil, outil bis et référents ; « Outils non utilisés » ignorés', () => {
  const {bootstrap} = bootstrapFor('normal', {sheetsApi: SHEETS_API});
  assert.strictEqual(bootstrap.toolLinks.length, 1);
  assert.deepStrictEqual([...bootstrap.toolLinks[0].links.map((link) => link.kind)], ['outil', 'referents']);
});

test('référents : évolution par filière et liste par pôle', () => {
  const {bootstrap} = bootstrapFor('normal');
  const evolution = bootstrap.referents.evolution;
  assert.deepStrictEqual([...evolution.map((series) => series.filiere)], ['CRC', 'PROT ENFANCE']);
  assert.strictEqual(evolution[0].points.length, 4);
  const poles = bootstrap.referents.poles;
  assert.strictEqual(poles.length, 4);
  assert.strictEqual(poles.filter((pole) => pole.referents.length > 0).length, 3, 'nom OU adresse mail');
  assert.strictEqual(poles.reduce((sum, pole) => sum + pole.referents.length, 0), 4);
  assert.deepStrictEqual([...poles.map((pole) => pole.directeur)], ['Directrice A', 'Directrice A', 'Directeur B / Appui C', 'Directeur B / Appui C']);
  assert.ok(poles.some((pole) => pole.referents.some((ref) => ref.email === 'mail@croix-rouge.fr')));

  // Code pôle absent de BDD NOMS : l'avertissement nomme la filière.
  const app = loadAppsScript({[REFERENTS_ID]: buildReferents()});
  const missing = poles[0].poleCode;
  const reference = {};
  poles.slice(1).forEach((pole) => { reference[app.normalizeText_(pole.poleCode)] = {}; });
  const warnings = [];
  app.console.warn = (message) => warnings.push(message);
  app.getReferentsForDashboard_(reference);
  assert.ok(warnings.some((w) => w.includes(`CRC : ${missing}`)), warnings.join(' | '));
});

test('bouton « Rafraîchir les archives » : import forcé, compte rendu et historique relu', () => {
  const archives = buildArchives();
  archives['Archives 09/26'] = [
    ['', '', '', '', 'TOTAL', 'SANITAIRE'],
    ['', '', 'TX DE TERMINES PARMIS LES CONCERNES', '', '', 'SANITAIRE'],
    ['', '', '', '', 'TOTAL', '%', '# terminés', '# réponses concernés'],
    ['', 'Actions socles 2024', 'Repas végétariens', '', 0.5, 0.6, 6, 10],
    ['', '', '', '', '', '', '', '']
  ];
  const app = loadAppsScript({[NATIONAL_ID]: buildNational('normal'), [ARCHIVES_ID]: archives});
  const first = app.rafraichirArchivesDepuisDashboard();
  assert.ok(first.report.some((line) => /Archives 09\/26 : \d+ valeurs/.test(line)), first.report.join(' | '));
  assert.ok(first.history.refreshedAt);
  assert.ok(first.history.rows.some((row) => row[2] === 'Repas végétariens' && row[3] === 'SAN' && row[5] === 6));
  // Forcé : réimporte même si les archives n'ont pas changé.
  assert.ok(app.rafraichirArchivesDepuisDashboard().report.some((line) => /lignes au total/.test(line)));

  const outsider = loadAppsScript({[NATIONAL_ID]: buildNational('normal'), [ARCHIVES_ID]: archives}, {email: 'x@gmail.com'});
  assert.throws(() => outsider.rafraichirArchivesDepuisDashboard(), /réservé/);
});

test('lecture groupée : même résultat en une requête pour le classeur national', () => {
  const plain = bootstrapFor('territoireEnDouble').bootstrap;
  const {app, bootstrap: batched} = bootstrapFor('territoireEnDouble', {batchGet: true});
  assert.strictEqual(app.__batchCalls.length, 1, 'une seule requête');
  assert.deepStrictEqual([...app.__batchCalls[0].ranges], ["'IMPORT DONNEES'!AM2:AZ", "'BDD NOMS'", "'BDD - Actions supplémentaires'", "'BDD - Bilan carbone'"]);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(batched.facts)), JSON.parse(JSON.stringify(plain.facts)));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(batched.poles)), JSON.parse(JSON.stringify(plain.poles)));
  assert.ok(batched.diagnostics.timings.some(([label]) => label === 'IMPORT DONNEES'), 'durées par étape');

  // Onglet renommé : la requête groupée échoue, lecture onglet par onglet.
  const national = buildNational('normal');
  national['Catalogue'] = national['BDD - Actions supplémentaires'];
  delete national['BDD - Actions supplémentaires'];
  const fallback = loadAppsScript({[NATIONAL_ID]: national, [ARCHIVES_ID]: buildArchives(), [REFERENTS_ID]: buildReferents()}, {batchGet: true}).getDashboardBootstrap();
  assert.ok(fallback.facts.rows.length > 0);
  assert.ok(fallback.diagnostics.warnings.some((w) => /Référentiel des actions : onglet introuvable/.test(w)));
});

test('accès : écran « demander l\'accès » sans le classeur national, liens pour les autres', () => {
  const denied = loadAppsScript({[ARCHIVES_ID]: buildArchives(), [REFERENTS_ID]: buildReferents()}).getDashboardBootstrap();
  assert.ok(denied.accessRequired, 'pas de données sans le classeur national');
  assert.deepStrictEqual([...denied.accessRequired.missing.map((item) => item.key)], ['national']);
  assert.match(denied.accessRequired.missing[0].url, new RegExp(`/spreadsheets/d/${NATIONAL_ID}/edit$`));
  assert.ok(!denied.facts, 'aucune donnée transmise');

  const partial = loadAppsScript({[NATIONAL_ID]: buildNational('normal'), [ARCHIVES_ID]: buildArchives()}).getDashboardBootstrap();
  assert.ok(!partial.accessRequired);
  assert.ok(partial.facts.rows.length > 0);
  assert.deepStrictEqual([...partial.diagnostics.accessLinks.map((item) => item.key)], ['referents']);
});


test('cibles calculées avec « BDD - Bilan carbone » pour les lignes sans cible (PROT ENFANCE)', () => {
  const {bootstrap} = bootstrapFor('normal');
  const fields = bootstrap.facts.fields;
  const get = (row, name) => row[fields.indexOf(name)];
  const prot = bootstrap.facts.rows.filter((row) => get(row, 'filiere') === 'PROT ENFANCE');
  // Repas végétariens : -2,07 × 16 % (moyenne filière, achats de biens) ÷ 14,70 % (bilan CRF).
  const repas = prot.filter((row) => get(row, 'action') === 'Repas végétariens');
  assert.ok(repas.length > 0);
  repas.forEach((row) => assert.strictEqual(get(row, 'cibleCalculee'), '-2,253%'));
  const bornes = prot.find((row) => get(row, 'action') === 'Bornes électriques');
  assert.strictEqual(get(bornes, 'cibleCalculee'), '-1,487%', 'transport : -1,61 × 32 ÷ 34,65');
  // Cible calculée aussi pour les lignes avec cible (pôles pilotes) ; seules
  // les lignes sans cible sont comptées comme « cible calculée ».
  const withTarget = bootstrap.facts.rows.filter((row) => get(row, 'reductionCible'));
  assert.ok(withTarget.length > 0 && withTarget.some((row) => get(row, 'cibleCalculee')));
  assert.deepStrictEqual({...bootstrap.diagnostics.details.bilanCarbone.ciblesCalculeesParFiliere}, {'PROT ENFANCE': prot.filter((row) => ['Repas végétariens', 'Bornes électriques'].includes(get(row, 'action'))).length});
  assert.ok(!bootstrap.diagnostics.warnings.some((w) => /Bilan carbone/.test(w)), bootstrap.diagnostics.warnings.join(' | '));

  // Capture réelle : bloc « Bilan CRF » de droite différent de la ligne du
  // tableau (achats de biens / immobilisations) -> signalé ; ligne du
  // tableau utilisée (immobilisations = 21 %, confirmé le 20/10/2026).
  const app = loadAppsScript({});
  const parsed = app.parseBilanCarboneValues_(require('./fixtures').buildBilanCarbone({incoherent: true}));
  assert.strictEqual(parsed.national['achats de biens'], 14.7);
  assert.strictEqual(parsed.national.immobilisations, 21);
  assert.ok(parsed.warnings.some((w) => /Achats de biens 14\.7 % \/ 21 %/.test(w)), parsed.warnings.join(' | '));
  assert.deepStrictEqual(Object.keys(parsed.filieres).sort(), ['CRC', 'PROT ENFANCE', 'SAN']);
});

test('référents : listes des filières lues depuis « Liens référents », IMPORT REFERENTS en complément', () => {
  const LINKED_ID = 'linked-crc';
  const crcPoles = require('./fixtures').buildPoles().filter((pole) => pole.filiere === 'CRC');
  const linkedApi = {Spreadsheets: {get: () => ({sheets: [{data: [{rowData: [
    {values: [{formattedValue: 'Outils A4T'}, {formattedValue: 'Code FILIERE'}, {formattedValue: 'Liens outils'}, {formattedValue: 'Liens outils bis'}, {formattedValue: 'Liens référents'}]},
    {values: [{formattedValue: 'Outil CRC NORD'}, {formattedValue: 'CRC'}, chip('Outil CRC', 'https://docs.google.com/x'), {}, chip('Liste référents environnement CRC', `https://docs.google.com/spreadsheets/d/${LINKED_ID}/edit#gid=0`)]},
    {values: [{formattedValue: 'Outil PROT.E.'}, {formattedValue: 'PROT ENFANCE'}, chip('Compilation', 'https://docs.google.com/y'), {}, chip('PROT.E._Liste référents', 'https://docs.google.com/spreadsheets/d/inconnu/edit')]}
  ]}]}]})}};
  const linked = {
    'Notice': [['Mode d\'emploi']],
    'Liste': [
      ['Liste des référents environnement — CRC'],
      [],
      ['Nom du pôle', 'Code pôle', 'Référent.e 1 Prénom et nom', 'Adresse mail (réf. 1)', 'Fonction (réf. 1)'],
      ...crcPoles.slice(0, 3).map((pole, i) => [pole.nom, pole.code, `Réf CRC ${i}`, `crc${i}@croix-rouge.fr`, 'Directeur·rice']),
      ['', '', '', '', '']
    ]
  };
  const app = loadAppsScript({[NATIONAL_ID]: buildNational('normal'), [ARCHIVES_ID]: buildArchives(), [REFERENTS_ID]: buildReferents(), [LINKED_ID]: linked}, {sheetsApi: linkedApi});
  const bootstrap = app.getDashboardBootstrap();
  const poles = bootstrap.referents.poles;
  const fromLinked = poles.filter((pole) => pole.source === 'Liste référents environnement CRC');
  assert.strictEqual(fromLinked.length, 3);
  assert.ok(fromLinked.every((pole) => pole.filiere === 'CRC' && pole.referents.length === 1), 'filière reprise du lien');
  // Le 4e pôle CRC n'est que dans IMPORT REFERENTS : gardé ; pas de doublon.
  assert.strictEqual(poles.length, 4);
  assert.strictEqual(poles.filter((pole) => pole.source === 'IMPORT REFERENTS').length, 1);
  const sources = bootstrap.referents.sources;
  const crcSource = sources.find((source) => source.title === 'Liste référents environnement CRC');
  assert.ok(crcSource.ok && /^onglet « Liste »/.test(crcSource.detail), crcSource.detail);
  assert.strictEqual(crcSource.withReferents, 3);

  // Autres intitulés de colonnes et libellés de filière des listes réelles.
  const other = app.parseReferentsList_([
    ['Filière', 'Nom', 'Code pôle', 'Référent n°1 (Prénom NOM)', 'Mail référent 1', 'Référent 2', 'Mail référent 2'],
    ['PROT.E.', 'MECS A', 'P1', 'Alice B', 'a@croix-rouge.fr', '', ''],
    ['PE', 'Crèche B', 'P2', '', '', 'Chloé D', 'c@croix-rouge.fr']
  ]);
  assert.strictEqual(JSON.stringify(other.poles.map((pole) => [pole.filiere, pole.poleName, pole.referents.map((ref) => ref.name).join()])),
    JSON.stringify([['PROT ENFANCE', 'MECS A', 'Alice B'], ['PET E', 'Crèche B', 'Chloé D']]));
  assert.ok(bootstrap.diagnostics.warnings.some((w) => /PROT\.E\._Liste référents.*non lue/.test(w)), bootstrap.diagnostics.warnings.join(' | '));
  assert.ok(bootstrap.diagnostics.accessLinks.some((item) => /PROT\.E\._Liste référents/.test(item.label)));
});
