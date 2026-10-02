// Tests de la partie serveur (Apps Script exécuté dans Node).
// Lancer : npm test (depuis la racine du dépôt).
const test = require('node:test');
const assert = require('node:assert');
const {loadAppsScript} = require('./harness');
const {NATIONAL_ID, ARCHIVES_ID, FILIERES, buildNational, buildArchives} = require('./fixtures');

function bootstrapFor(variant, options) {
  const app = loadAppsScript({[NATIONAL_ID]: buildNational(variant), [ARCHIVES_ID]: buildArchives()}, options);
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
  // Service avancé Sheets simulé : une ligne de "Liens outils" avec chip.
  const sheetsApi = {Spreadsheets: {get: () => ({sheets: [{data: [{rowData: [{values: [
    {formattedValue: 'Outil CRC'}, {formattedValue: 'CRC'},
    {formattedValue: 'OUTIL DE SUIVI v2 - CRC', chipRuns: [{chip: {richLinkProperties: {uri: 'https://docs.google.com/x'}}}]}
  ]}]}]}]})}};
  const app = loadAppsScript({[NATIONAL_ID]: buildNational('normal'), [ARCHIVES_ID]: buildArchives()}, {sheetsApi});
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
