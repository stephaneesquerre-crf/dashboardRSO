// Tests de l'interface : Index.html chargé dans Chromium avec un faux
// google.script.run qui renvoie le bootstrap produit par le vrai code
// serveur (banc d'essai Node). Nécessite le paquet "playwright" ; ignoré
// sinon. Chemin du navigateur : variable CHROMIUM_PATH (facultative).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {loadAppsScript} = require('./harness');
const {NATIONAL_ID, ARCHIVES_ID, REFERENTS_ID, FILIERES, buildNational, buildArchives, buildReferents} = require('./fixtures');

let playwright = null;
try { playwright = require('playwright'); } catch (error) { /* non installé */ }

function pageWithBootstrap(bootstrap, delayMs = 0) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8');
  const stub = `<script>window.google={script:{run:{_s:null,_f:null,withSuccessHandler(f){this._s=f;return this},withFailureHandler(f){this._f=f;return this},getDashboardBootstrap(o){(window.__bootstrapCalls=window.__bootstrapCalls||[]).push(o||null);const f=this._s;const data=${JSON.stringify(bootstrap)};setTimeout(()=>f(data),${delayMs})},rafraichirArchivesDepuisDashboard(){const f=this._s;const history=${JSON.stringify(bootstrap.history)};setTimeout(()=>f({report:['Archives 09/26 : 3 valeurs (mois 2026-09)','2 lignes au total dans "HISTORIQUE TDB VA".'],history,warnings:[]}),0)}}}};</script>`;
  const file = path.join(os.tmpdir(), `dashboard-rso-test-${process.pid}.html`);
  fs.writeFileSync(file, html.replace(/<body[^>]*>/, (tag) => `${tag}${stub}`));
  return file;
}

test('interface : territoires de chaque filière dans Synthèse, Détail par pôle et Détail par poste', {skip: !playwright && 'playwright non installé'}, async () => {
  const app = loadAppsScript({[NATIONAL_ID]: buildNational('territoireEnDouble'), [ARCHIVES_ID]: buildArchives(), [REFERENTS_ID]: buildReferents()});
  const bootstrap = JSON.parse(JSON.stringify(app.getDashboardBootstrap()));
  const file = pageWithBootstrap(bootstrap);
  const browser = await playwright.chromium.launch(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {});
  const errors = [];
  try {
    const page = await browser.newPage({viewport: {width: 1400, height: 1000}});
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`file://${file}`);
    await page.waitForFunction(() => typeof state !== 'undefined' && state.bootstrap);

    const tabs = await page.$$eval('.tab-button', (buttons) => buttons.map((b) => b.textContent.trim()));
    assert.deepStrictEqual(tabs, ['Évolution des actions socles', 'Synthèse', "Détail par poste d'émissions", 'Détail par pôle', 'Référents', 'Contrôle et méthodologie']);

    // Vue Référents : indicateurs et liste.
    await page.click('#tab-referents');
    const kpis = await page.$$eval('#referents-kpis dd', (cells) => cells.map((c) => c.firstChild.textContent));
    assert.deepStrictEqual(kpis, ['75 %', '4'], kpis.join(' | '));
    assert.strictEqual(await page.$$eval('#referents-table-body tr', (rows) => rows.length), 4);
    const head = await page.$$eval('#referents-table-head th', (cells) => cells.map((c) => c.textContent.replace(/ [▲▼]$/, '')));
    assert.deepStrictEqual(head.slice(0, 5), ['Pôle', 'Code pôle', 'Filière', 'Territoire', 'Directeur·rice de territoire']);
    assert.deepStrictEqual(await page.$$eval('#referents-table-body td.referents-code', (cells) => cells.map((c) => c.textContent)).then((codes) => [...codes].sort()), ['CRC_00', 'CRC_01', 'CRC_10', 'CRC_11']);
    // Territoire affiché avec ses régions (BDD NOMS), filtre compris.
    const referentTerritories = await page.$$eval('#referents-table-body tr td:nth-child(4)', (cells) => cells.map((c) => c.textContent));
    assert.ok(referentTerritories.every((text) => /^Territoire [AB] · Régions [01]$/.test(text)), referentTerritories.join(' | '));
    await page.selectOption('#referents-filiere', 'CRC');
    const referentOptions = await page.$$eval('#referents-territoire option', (options) => options.map((o) => [o.value, o.textContent]));
    assert.deepStrictEqual(referentOptions, [['', 'Toute la filière'], ['Territoire A', 'Territoire A · Régions 0'], ['Territoire B', 'Territoire B · Régions 1']]);
    await page.selectOption('#referents-filiere', '');
    assert.deepStrictEqual(await page.$$eval('#referents-table-body a[href^="mailto:"]', (links) => links.map((l) => l.getAttribute('href'))), ['mailto:mail@croix-rouge.fr']);
    // Tri par nom du pôle, croissant puis décroissant.
    const names = () => page.$$eval('#referents-table-body tr td:first-child', (cells) => cells.map((c) => c.textContent));
    await page.click('#referents-table-head button:has-text("Pôle")');
    const ascending = await names();
    assert.deepStrictEqual(ascending, [...ascending].sort((a, b) => a.localeCompare(b, 'fr')));
    await page.click('#referents-table-head button:has-text("Pôle")');
    assert.deepStrictEqual(await names(), [...ascending].reverse());
    // Couverture par filière : une ligne par filière (évolution ou liste).
    const filieresRows = await page.$$eval('#referents-filieres-body tr', (rows) => rows.map((r) => [...r.cells].map((c) => c.textContent)));
    assert.deepStrictEqual(filieresRows.map((r) => r[0]), ['CRC', 'DOM', 'PROT ENFANCE'], 'DNOM affiché comme DOM');
    assert.match(filieresRows[0][1], /100/);
    assert.match(filieresRows[0][3], /75 %.*3 \/ 4/);
    assert.match(filieresRows[1][1], /85/);
    assert.strictEqual(filieresRows[2][3], '—');

    // Export en image (PNG) : panneau d'un graphique et tuile d'un poste.
    const pngOf = async (click) => {
      const [download] = await Promise.all([page.waitForEvent('download'), click()]);
      const buffer = fs.readFileSync(await download.path());
      assert.strictEqual(buffer.slice(1, 4).toString(), 'PNG', download.suggestedFilename());
      return {name: download.suggestedFilename(), width: buffer.readUInt32BE(16), size: buffer.length};
    };
    const chartPng = await pngOf(() => page.click('#chart-panel-referents .image-export'));
    assert.match(chartPng.name, /^dashboard-rso-taux-de-couverture-par-filiere-\d{4}-\d{2}-\d{2}\.png$/);
    const panelWidth = await page.$eval('#chart-panel-referents', (el) => Math.ceil(el.getBoundingClientRect().width));
    assert.strictEqual(chartPng.width, panelWidth * 2, 'résolution double');
    await page.click('#tab-poste');
    const tilePng = await pngOf(() => page.click('#poste-grid .poste-group .tile-image-export'));
    assert.ok(tilePng.size > 2000, `tuile : ${tilePng.size} octets`);
    assert.ok(await page.$$eval('.image-export[data-image-target]', (buttons) => buttons.every((b) => document.getElementById(b.dataset.imageTarget))));

    // Tuiles selon l'indicateur : terminées / concernées par défaut, puis
    // moyenne d'avancement ; même taux que les compteurs « À 100 % ».
    assert.strictEqual(await page.$eval('#poste-reduction-mode', (select) => select.value), 'termines');
    const tileHead = () => page.$eval('#poste-grid .poste-table th:nth-child(2)', (th) => th.textContent);
    const tileRows = () => page.$$eval('#poste-grid .poste-group:first-child tbody tr', (rows) => rows.map((r) => [r.cells[1].textContent.trim(), r.cells[2].textContent.trim()]));
    assert.match(await tileHead(), /Terminées \/ concernées/);
    for (const [rate, counts] of await tileRows()) {
      const [done, concerned] = counts.split('/').map((n) => Number(n.trim()));
      assert.strictEqual(rate, `${(Math.round(done / concerned * 1000) / 10).toLocaleString('fr-FR')} %`, `${rate} vs ${counts}`);
    }
    await page.selectOption('#poste-reduction-mode', 'avancement');
    assert.match(await tileHead(), /Avancement moyen/);
    assert.deepStrictEqual((await tileRows()).map((r) => r[0]), ['54,5 %', '42,3 %']);
    await page.selectOption('#poste-reduction-mode', 'termines');

    // PROT ENFANCE (aucune cible saisie) : cibles calculées avec « BDD -
    // Bilan carbone », donc une réduction cible non nulle.
    await page.selectOption('#poste-filiere', 'PROT ENFANCE');
    assert.match(await page.textContent('#poste-co2-summary'), /cible -\d+,\d+ %.*cible calculée avec « BDD - Bilan carbone »/s);
    await page.selectOption('#poste-filiere', '');
    // Cible saisie à 0 : remplacée par la cible calculée (à date = cible ×
    // avancement) ; cible saisie non nulle : conservée.
    const zero = await page.evaluate(() => aggregateReductionByPole([
      {poleCode: 'Z1', reductionCible: '0%', reductionADate: '0%', cibleCalculee: '-1,5%', avancement: '100%'},
      {poleCode: 'Z2', reductionCible: '-0,2%', reductionADate: '-0,1%', cibleCalculee: '-1,5%', avancement: '50%'}
    ]));
    assert.deepStrictEqual([zero.cible, zero.computedTargetCount], [(-1.5 - 0.2) / 2, 1]);

    // Actions spécifiques filière repérées dans les tuiles par une étiquette.
    assert.strictEqual(await page.$$eval('#poste-grid .action-badge', (badges) => badges.length), 0, 'aucune sans la coche');
    await page.check('#poste-filiere-specific');
    const badged = await page.$$eval('#poste-grid tr.is-specific td:first-child', (cells) => cells.map((c) => c.textContent));
    assert.deepStrictEqual(badged, ['Action filière X Spécifique filière']);
    await page.uncheck('#poste-filiere-specific');

    // Tableau des tuiles : CSV (toutes les tuiles, une tuile) et copie.
    const csvOf = async (click) => {
      const [download] = await Promise.all([page.waitForEvent('download'), click()]);
      return {name: download.suggestedFilename(), text: fs.readFileSync(await download.path(), 'utf8').replace(/^\ufeff/, '')};
    };
    const allCsv = await csvOf(() => page.click('#poste-csv'));
    const lines = allCsv.text.split('\r\n');
    assert.match(lines[0], /^"Périmètre","Indicateur","Poste d'émissions","Action","% Terminées \/ concernées"/);
    assert.ok(lines.some((line) => /"Transport","Ecoconduite"/.test(line)), lines.join('\n'));
    assert.ok(lines.some((line) => /"Total du poste"/.test(line)));
    const tileCsv = await csvOf(() => page.click('#poste-grid .poste-group:first-child button:has-text("CSV")'));
    assert.match(tileCsv.name, /^dashboard-rso-transport-\d{4}-\d{2}-\d{2}\.csv$/);
    assert.ok(tileCsv.text.split('\r\n').length < lines.length);
    await page.click('#poste-copy');
    assert.strictEqual(await page.textContent('#poste-copy'), 'Copié ✓');

    // Bouton « Rafraîchir les archives » (vue Évolution).
    await page.click('#tab-evolution');
    await page.click('#refresh-archives');
    await page.waitForFunction(() => /réimportées/.test(document.getElementById('refresh-archives-status').textContent));
    assert.ok(!(await page.$eval('#refresh-archives', (button) => button.disabled)));

    for (const [filiere, territories] of Object.entries(FILIERES)) {
      await page.click('#tab-synthese');
      await page.selectOption('#synthese-filiere', filiere);
      const syntheseOptions = await page.$$eval('#synthese-territoire option', (options) => options.map((o) => o.value));
      territories.forEach((t) => assert.ok(syntheseOptions.includes(t), `Synthèse ${filiere} : ${t}`));
      const niveaux = await page.$$eval('#synthese-niveau option', (options) => options.filter((o) => !o.hidden).map((o) => o.value));
      assert.deepStrictEqual(niveaux, ['territoire', 'thematique', 'volet', 'action'], `Regrouper par ${filiere}`);
      await page.selectOption('#synthese-niveau', 'territoire');
      const bars = await page.$$eval('#chart .category-text', (labels) => labels.map((l) => l.textContent));
      assert.deepStrictEqual([...bars].sort(), territories.map((t, i) => `${t} · Régions ${i}`).sort(), `graphique Synthèse ${filiere}`);
      // Clic sur une barre : le filtre reçoit le nom court du territoire.
      await page.click('#chart .bar-hit');
      assert.ok(territories.includes(await page.$eval('#detail-territoire', (select) => select.value)), `navigation ${filiere}`);
      await page.selectOption('#detail-territoire', '');

      await page.click('#tab-detail');
      await page.selectOption('#detail-filiere', filiere);
      const matrixTerritories = await page.$$eval('#matrix-territoire-row th', (cells) => cells.map((c) => c.textContent).filter(Boolean));
      assert.strictEqual(matrixTerritories.length, territories.length, `Détail par pôle ${filiere}`);
      // Changement de territoire : teintes alternées et filet vertical.
      const groupClasses = await page.$$eval('#matrix-territoire-row th.matrix-territoire-group', (cells) => cells.map((c) => c.className));
      groupClasses.forEach((className, index) => {
        assert.match(className, index % 2 ? /terr-b/ : /terr-a/);
        assert.strictEqual(/terr-start/.test(className), index > 0);
      });
      const starts = await page.$$eval('#matrix-header-row th.terr-start', (cells) => cells.length);
      assert.strictEqual(starts, territories.length - 1, `filets ${filiere}`);

      await page.click('#tab-poste');
      await page.selectOption('#poste-filiere', filiere);
      const posteOptions = await page.$$eval('#poste-territoire option', (options) => options.map((o) => o.value));
      territories.forEach((t) => assert.ok(posteOptions.includes(t), `Détail par poste ${filiere} : ${t}`));
    }

    // Trajectoire (Détail par poste) : une étape par année socle des données.
    await page.click('#tab-poste');
    await page.selectOption('#poste-filiere', '');
    const years = await page.$$eval('#trajectoire-years .trajectoire-year h3', (titles) => titles.map((t) => t.textContent.split(' ')[1]));
    assert.deepStrictEqual(years, ['2024', '2025']);
    assert.match(await page.textContent('#trajectoire-note'), /Fin 2025/);

    // Barres de la synthèse triées par valeur décroissante ; indicateur par
    // défaut « Terminées / concernées ».
    await page.click('#tab-synthese');
    await page.selectOption('#synthese-filiere', '');
    assert.strictEqual(await page.$eval('#synthese-indicateur', (select) => select.value), 'tauxTerminees');
    assert.strictEqual(await page.$eval('#synthese-niveau', (select) => select.value), 'filiere');
    // Détail des données : même tableau par action pour toutes les filières.
    const tableHeaders = await page.$$eval('#data-table-head th', (cells) => cells.map((c) => c.textContent.replace(/[▲▼]/g, '').trim()));
    assert.deepStrictEqual(tableHeaders, ['Action', 'Thématique', 'Campagne', '% Terminés', 'Pôles ayant terminé', 'Pôles concernés']);
    assert.ok(await page.$$eval('#data-table-body tr', (rows) => rows.length) > 0);
    // Ligne teintée selon l'année socle de l'action ; action filière sans couleur.
    const socleRows = () => page.$$eval('#data-table-body tr', (rows) => rows.map((r) => [r.cells[0].textContent, r.className.replace('clickable-row', '').trim(), getComputedStyle(r).backgroundColor]));
    let rowsBySocle = await socleRows();
    const socleOf = (action) => rowsBySocle.find(([label]) => label === action);
    assert.strictEqual(socleOf('Repas végétariens')[1], 'socle-2024');
    assert.strictEqual(socleOf('Bornes électriques')[1], 'socle-2025');
    assert.notStrictEqual(socleOf('Repas végétariens')[2], socleOf('Bornes électriques')[2]);
    await page.uncheck('#synthese-tracked-only');
    rowsBySocle = await socleRows();
    assert.strictEqual(socleOf('Action filière X')[1], '', 'action filière sans couleur');
    await page.check('#synthese-tracked-only');
    assert.strictEqual(await page.$$eval('#matrix-body tr[class*="socle-"]', (rows) => rows.length), 0, 'Détail par pôle sans couleur de socle');

    // Évolution : regroupement par campagne / thématique, courbes par filière.
    await page.click('#tab-evolution');
    for (const groupe of ['campagne', 'thematique']) {
      await page.selectOption('#evolution-groupe', groupe);
      const groups = await page.$$eval('#evolution-multiples .evolution-group h3', (titles) => titles.map((t) => t.textContent));
      assert.ok(groups.length > 0, `Évolution groupée par ${groupe}`);
    }
    assert.match(await page.textContent('#evolution-caveat'), /augmentation du nombre de répondants/);
    const filiereLegend = await page.$$eval('#evolution-filieres-legend span', (items) => items.map((i) => i.textContent).filter(Boolean));
    assert.ok(filiereLegend.includes('Ensemble'), filiereLegend.join(', '));
    const values = await page.evaluate(() => {
      const key = elements.syntheseIndicateur.value;
      return state.syntheseSnapshot.groups.filter((g) => g[key] !== null).map((g) => g[key]);
    });
    const drawnOrder = await page.$$eval('#chart .bar-hit', (bars) => bars.map((b) => Number((b.getAttribute('aria-label').match(/: ([\d,]+) %/) || [])[1]?.replace(',', '.'))));
    assert.deepStrictEqual(drawnOrder, [...values].sort((a, b) => b - a));

    // « Actualiser les données » : relecture forcée, vues réaffichées,
    // filtre conservé.
    await page.click('#tab-synthese');
    await page.selectOption('#synthese-filiere', 'SAN');
    assert.ok(await page.isVisible('#refresh-data'));
    await page.click('#refresh-data');
    await page.waitForFunction(() => !document.getElementById('refresh-data').disabled);
    assert.deepStrictEqual(await page.evaluate(() => window.__bootstrapCalls), [null, {forceRefresh: true}]);
    assert.strictEqual(await page.textContent('#refresh-data'), '🔄 Actualiser les données');
    assert.match(await page.textContent('#status'), /^Données lues à/);
    assert.strictEqual(await page.$eval('#synthese-filiere', (select) => select.value), 'SAN');
    assert.ok(await page.$$eval('#data-table-body tr', (rows) => rows.length) > 0);

    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
    fs.unlinkSync(file);
  }
});

test('interface : indicateur de chargement visible pendant la lecture des données', {skip: !playwright && 'playwright non installé'}, async () => {
  const app = loadAppsScript({[NATIONAL_ID]: buildNational('normal'), [ARCHIVES_ID]: buildArchives(), [REFERENTS_ID]: buildReferents()});
  const file = pageWithBootstrap(JSON.parse(JSON.stringify(app.getDashboardBootstrap())), 2500);
  const browser = await playwright.chromium.launch(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {});
  try {
    const page = await browser.newPage();
    await page.goto(`file://${file}`);
    assert.ok(await page.isVisible('#loading-panel'));
    assert.ok(!(await page.isVisible('.tabs')), 'onglets masqués pendant le chargement');
    await page.waitForFunction(() => /\(1 s\)/.test(document.getElementById('loading-title').textContent));
    await page.waitForFunction(() => typeof state !== 'undefined' && state.bootstrap);
    assert.ok(!(await page.isVisible('#loading-panel')));
    assert.ok(await page.isVisible('.tabs'));
  } finally {
    await browser.close();
  }
});

test('interface : écran « demander l\'accès » sans droits sur le classeur national', {skip: !playwright && 'playwright non installé'}, async () => {
  const app = loadAppsScript({[ARCHIVES_ID]: buildArchives(), [REFERENTS_ID]: buildReferents()});
  const file = pageWithBootstrap(JSON.parse(JSON.stringify(app.getDashboardBootstrap())));
  const browser = await playwright.chromium.launch(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {});
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`file://${file}`);
    await page.waitForFunction(() => /Accès aux données/.test(document.getElementById('loading-title').textContent));
    const links = await page.$$eval('#loading-links a', (anchors) => anchors.map((a) => [a.textContent, a.getAttribute('href'), a.target]));
    assert.deepStrictEqual(links, [['REPORTING NATIONAL', `https://docs.google.com/spreadsheets/d/${NATIONAL_ID}/edit`, '_blank']]);
    assert.ok(!(await page.isVisible('.tabs')), 'aucune vue affichée');
    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
  }
});
