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
  assert.deepStrictEqual([...evolution.map((series) => series.filiere)], ['CRC', 'PROT ENFANCE', 'DOM'], 'DNOM = DOM');
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

test("référents : IMPORT REFERENTS d'abord, listes des filières seulement pour une filière absente", () => {
  const LINKED_ID = 'linked-psh';
  const linkedApi = {Spreadsheets: {get: () => ({sheets: [{data: [{rowData: [
    {values: [{formattedValue: 'Outils A4T'}, {formattedValue: 'Code FILIERE'}, {formattedValue: 'Liens outils'}, {formattedValue: 'Liens outils bis'}, {formattedValue: 'Liens référents'}]},
    // CRC est dans IMPORT REFERENTS : son lien n'est pas ouvert.
    {values: [{formattedValue: 'Outil CRC NORD'}, {formattedValue: 'CRC'}, chip('Outil CRC', 'https://docs.google.com/x'), {}, chip('Liste référents environnement CRC', 'https://docs.google.com/spreadsheets/d/jamais-ouvert/edit')]},
    {values: [{formattedValue: 'Outil HANDICAP'}, {formattedValue: 'PSH'}, chip('Outil PSH', 'https://docs.google.com/y'), {}, chip('Liste référents PSH', `https://docs.google.com/spreadsheets/d/${LINKED_ID}/edit#gid=0`)]},
    {values: [{formattedValue: 'Outil PROT.E.'}, {formattedValue: 'PROT ENFANCE'}, chip('Compilation', 'https://docs.google.com/z'), {}, chip('PROT.E._Liste référents', 'https://docs.google.com/spreadsheets/d/inconnu/edit')]}
  ]}]}]})}};
  const linked = {
    'Notice': [['Mode d\'emploi']],
    'Liste': [
      ['Liste des référents environnement — PSH'],
      [],
      ['Nom du pôle', 'Code pôle', 'Référent.e 1 Prénom et nom', 'Adresse mail (réf. 1)', 'Fonction (réf. 1)'],
      ['MAS A', 'PSH_1', 'Réf PSH', 'psh@croix-rouge.fr', 'AMP'],
      ['', '', '', '', '']
    ]
  };
  const app = loadAppsScript({[NATIONAL_ID]: buildNational('normal'), [ARCHIVES_ID]: buildArchives(), [REFERENTS_ID]: buildReferents(), [LINKED_ID]: linked}, {sheetsApi: linkedApi});
  const bootstrap = app.getDashboardBootstrap();
  const poles = bootstrap.referents.poles;
  assert.strictEqual(poles.filter((pole) => pole.source === 'IMPORT REFERENTS').length, 4, 'CRC lus dans IMPORT REFERENTS');
  const psh = poles.filter((pole) => pole.source === 'Liste référents PSH');
  assert.strictEqual(JSON.stringify(psh.map((pole) => [pole.filiere, pole.poleCode, pole.referents.length])), JSON.stringify([['PSH', 'PSH_1', 1]]));
  const titles = bootstrap.referents.sources.map((source) => source.title);
  assert.ok(!titles.includes('Liste référents environnement CRC'), 'lien CRC non ouvert');
  assert.ok(bootstrap.diagnostics.warnings.some((w) => /PROT\.E\._Liste référents.*non lue/.test(w)), bootstrap.diagnostics.warnings.join(' | '));
  assert.ok(bootstrap.diagnostics.accessLinks.some((item) => /PROT\.E\._Liste référents/.test(item.label)));

  // Autres intitulés de colonnes et libellés de filière.
  const other = app.parseReferentsList_([
    ['Filière', 'Nom', 'Code pôle', 'Référent n°1 (Prénom NOM)', 'Mail référent 1', 'Référent 2', 'Mail référent 2'],
    ['PROT.E.', 'MECS A', 'P1', 'Alice B', 'a@croix-rouge.fr', '', ''],
    ['PE', 'Crèche B', 'P2', '', '', 'Chloé D', 'c@croix-rouge.fr']
  ]);
  assert.strictEqual(JSON.stringify(other.poles.map((pole) => [pole.filiere, pole.poleName, pole.referents.map((ref) => ref.name).join()])),
    JSON.stringify([['PROT ENFANCE', 'MECS A', 'Alice B'], ['PET E', 'Crèche B', 'Chloé D']]));
});

test('référents : onglet IMPORT REFERENTS en blocs (une filière par bloc, lignes de fin et de synthèse)', () => {
  const head = (code) => ['Réf. territoire', 'Région', 'DT (directeur territorial)', 'Filière', 'Nom pôle / établissement', 'Activité', 'Ville', code,
    'Référent.e 1 \nPrénom et nom', 'Adresse mail (réf. 1)', 'Fonction (réf. 1)', 'Référent.e 2 \nPrénom et nom', 'Adresse mail (réf. 2)', 'Fonction (réf. 2)',
    'Référent.e 3 \nPrénom et nom', 'Adresse mail (réf. 3)', 'Fonction (réf. 3)', 'Référent.e \nOui/Non', 'Date MàJ outil de suivi'];
  const line = (cells) => { const row = Array(21).fill(''); Object.entries(cells).forEach(([i, v]) => { row[i] = v; }); return row; };
  const end = line({0: '-------  LIGNE DE FIN DES DONNEES ----------', 5: '-------  LIGNE DE FIN DES DONNEES ----------   NE RIEN ECRIRE EN DESSOUS'});
  const peBlock = [
    head('Code Pôle'),
    line({3: 'PE', 4: 'Univers des Patabulles', 7: 'Territoire B : GE - BFC - ARA - PACAC_4603 4497 - 1', 8: 'directeur 1', 17: 'OUI'}),
    line({3: 'PE', 4: 'Multi-Accueil Laval', 7: 'Territoire A : HDF - IDF - NA - PDL_1405', 8: 'directeur 6', 17: 'OUI'}),
    line({17: 'NON'}),
    end,
    line({3: 'Nb pôles/ établissements', 4: 26}),
    line({3: 'taux de couverture référents / pôle', 4: '100%'}),
    line({18: 'FAIT'})
  ];
  const values = [
    head('Code Pôle'),
    line({0: 'A - IDF', 2: 'Françoise BOUSQUET', 3: 'FLEX', 4: 'Pôle 75/92', 7: 'Territoire A : IDF_2537 4377', 8: 'Marie B', 9: 'marie.b@croix-rouge.fr', 17: 'OUI'}),
    line({0: 'D - BFC', 3: 'FLEX', 4: 'Pôle 20', 7: 'Territoire D : BFC_4567', 17: 'NON'}),
    line({}),
    end,
    line({3: 'Nb pôles/ établissements', 4: 32, 7: 'Nombre de référents'}),
    line({0: 'EHPAD'}),
    ...peBlock,
    head('Code'),
    line({0: 'A - HDF', 3: 'CRC', 4: 'Calais', 7: 'Territoire A : HDF_1768', 8: 'Rudy Bogaert', 9: 'Rudy Bogaert', 17: 'OUI'}),
    end,
    ...peBlock
  ];
  const app = loadAppsScript({});
  const parsed = app.parseReferentsList_(values);
  assert.strictEqual(JSON.stringify(parsed.poles.map((pole) => [pole.filiere, pole.poleName, pole.referents.length])), JSON.stringify([
    ['FLEX', 'Pôle 75/92', 1], ['FLEX', 'Pôle 20', 0], ['PET E', 'Univers des Patabulles', 1], ['PET E', 'Multi-Accueil Laval', 1], ['CRC', 'Calais', 1]
  ]), 'synthèses ignorées, bloc PE en double lu une fois, bloc CRC (« Code ») lu');
  assert.strictEqual(parsed.withoutCode, 0);

  // Rapprochement avec BDD NOMS : suffixe « - n » retiré, puis mêmes numéros.
  const reference = {};
  [['Territoire B : GE - BFC - ARA - PACAC_4603 4497', 'Territoire B'], ['PE Territoire A : HDF - IDF - PDL_1405', 'Territoire A']].forEach(([code, territoire]) => {
    reference[app.normalizeText_(code)] = {poleCode: code, territoire};
  });
  const index = app.buildPoleCodeIndex_(reference);
  assert.strictEqual(app.matchPoleCode_('Territoire B : GE - BFC - ARA - PACAC_4603 4497 - 1', reference, index).territoire, 'Territoire B');
  assert.strictEqual(app.matchPoleCode_('Territoire A : HDF - IDF - NA - PDL_1405', reference, index).territoire, 'Territoire A');
  assert.strictEqual(app.matchPoleCode_('Territoire A : IDF_9999', reference, index), null);
});

test('cache : données gardées entre deux ouvertures, « Actualiser » relit les classeurs', () => {
  const cacheLog = [];
  const {app, bootstrap: first} = bootstrapFor('normal', {cacheLog});
  assert.ok(!first.fromCache);
  assert.ok(cacheLog.some((key) => /\|meta$/.test(key)), 'cache écrit après une lecture complète');
  // Classeur modifié : la deuxième ouverture sert encore le cache…
  const importSheet = app.__spreadsheets[NATIONAL_ID].getSheetByName('IMPORT DONNEES');
  importSheet.values = importSheet.values.slice(0, 2);
  const second = app.getDashboardBootstrap();
  assert.ok(second.fromCache);
  assert.strictEqual(JSON.stringify(second.facts), JSON.stringify(first.facts));
  assert.strictEqual(second.diagnostics.timings.map(([label]) => label).join(' | '), 'Vérification des accès | Lecture du cache');
  // … « Actualiser les données » relit les classeurs.
  const refreshed = app.getDashboardBootstrap({forceRefresh: true});
  assert.ok(!refreshed.fromCache);
  assert.ok(refreshed.facts.rows.length < first.facts.rows.length);
  assert.strictEqual(app.getDashboardBootstrap().facts.rows.length, refreshed.facts.rows.length, 'cache remplacé');
  // viderCacheDashboard (ex. après « Rafraîchir les archives ») : relecture.
  app.viderCacheDashboard();
  assert.ok(!app.getDashboardBootstrap().fromCache);
});

test('cache : une personne sans accès aux archives ni aux référents ne reçoit pas ces données', () => {
  // Service avancé Sheets : contrôle d'accès refait à chaque appel (sans
  // lui, le banc d'essai garde les classeurs ouverts d'un appel à l'autre).
  const {app, bootstrap: full} = bootstrapFor('normal', {sheetsApi: SHEETS_API});
  assert.ok(full.history.rows.length > 0 && full.referents.poles.length > 0);
  delete app.__spreadsheets[ARCHIVES_ID];
  delete app.__spreadsheets[REFERENTS_ID];
  app.CacheService.getUserCache().remove('dashboard-access-v1');
  const restricted = app.getDashboardBootstrap();
  assert.ok(restricted.fromCache);
  assert.strictEqual(restricted.history.rows.length, 0);
  assert.strictEqual(restricted.referents.poles.length, 0);
  assert.strictEqual(restricted.diagnostics.accessLinks.map((item) => item.key).sort().join(','), 'archives,referents');
  // Lecture complète par cette personne : non mise en cache (données partielles).
  app.viderCacheDashboard();
  app.getDashboardBootstrap({forceRefresh: true});
  assert.strictEqual(app.readBootstrapCache_(), null);
});

test('cache : données volumineuses découpées en morceaux de moins de 100 Ko', () => {
  const cacheLog = [];
  const app = loadAppsScript({}, {cacheLog});
  const big = require('crypto').randomBytes(200 * 1024).toString('hex');
  app.writeBootstrapCache_({generatedAt: 'x', diagnostics: {warnings: []}, big});
  assert.ok(cacheLog.filter((key) => /\|\d+$/.test(key)).length > 1, 'plusieurs morceaux');
  assert.strictEqual(app.readBootstrapCache_().big, big);
});
