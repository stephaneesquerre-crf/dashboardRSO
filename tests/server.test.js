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
  {values: [{formattedValue: 'Outil CRC'}, {formattedValue: 'CRC'}, chip('OUTIL DE SUIVI v2 - CRC', 'https://docs.google.com/x'), {}, chip('CRC_Liste référents', 'https://docs.google.com/r')]},
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
});
