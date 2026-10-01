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
const {NATIONAL_ID, ARCHIVES_ID, FILIERES, buildNational, buildArchives} = require('./fixtures');

let playwright = null;
try { playwright = require('playwright'); } catch (error) { /* non installé */ }

function pageWithBootstrap(bootstrap) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8');
  const stub = `<script>window.google={script:{run:{_s:null,_f:null,withSuccessHandler(f){this._s=f;return this},withFailureHandler(f){this._f=f;return this},getDashboardBootstrap(){const f=this._s;const data=${JSON.stringify(bootstrap)};setTimeout(()=>f(data),0)}}}};</script>`;
  const file = path.join(os.tmpdir(), `dashboard-rso-test-${process.pid}.html`);
  fs.writeFileSync(file, html.replace('<body class="viz-root">', `<body class="viz-root">${stub}`));
  return file;
}

test('interface : territoires de chaque filière dans Synthèse, Détail par pôle et Détail par poste', {skip: !playwright && 'playwright non installé'}, async () => {
  const app = loadAppsScript({[NATIONAL_ID]: buildNational('territoireEnDouble'), [ARCHIVES_ID]: buildArchives()});
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
    assert.deepStrictEqual(tabs, ['Évolution des actions socle', 'Synthèse', "Détail par poste d'émissions", 'Détail par pôle', 'Contrôle et méthodologie']);

    for (const [filiere, territories] of Object.entries(FILIERES)) {
      await page.click('#tab-synthese');
      await page.selectOption('#synthese-filiere', filiere);
      const syntheseOptions = await page.$$eval('#synthese-territoire option', (options) => options.map((o) => o.value));
      territories.forEach((t) => assert.ok(syntheseOptions.includes(t), `Synthèse ${filiere} : ${t}`));
      await page.selectOption('#synthese-territoire', '__territoires_detail__');
      const bars = await page.$$eval('#chart .category-text', (labels) => labels.map((l) => l.textContent));
      assert.deepStrictEqual([...bars].sort(), [...territories].sort(), `graphique Synthèse ${filiere}`);

      await page.click('#tab-detail');
      await page.selectOption('#detail-filiere', filiere);
      const matrixTerritories = await page.$$eval('#matrix-territoire-row th', (cells) => cells.map((c) => c.textContent).filter(Boolean));
      assert.strictEqual(matrixTerritories.length, territories.length, `Détail par pôle ${filiere}`);

      await page.click('#tab-poste');
      await page.selectOption('#poste-filiere', filiere);
      const posteOptions = await page.$$eval('#poste-territoire option', (options) => options.map((o) => o.value));
      territories.forEach((t) => assert.ok(posteOptions.includes(t), `Détail par poste ${filiere} : ${t}`));
    }

    // Barres de la synthèse triées par valeur décroissante.
    await page.click('#tab-synthese');
    await page.selectOption('#synthese-filiere', '');
    const values = await page.evaluate(() => {
      const key = elements.syntheseIndicateur.value;
      return state.syntheseSnapshot.groups.filter((g) => g[key] !== null).map((g) => g[key]);
    });
    const drawnOrder = await page.$$eval('#chart .bar-hit', (bars) => bars.map((b) => Number((b.getAttribute('aria-label').match(/: ([\d,]+) %/) || [])[1]?.replace(',', '.'))));
    assert.deepStrictEqual(drawnOrder, [...values].sort((a, b) => b - a));

    assert.deepStrictEqual(errors, []);
  } finally {
    await browser.close();
    fs.unlinkSync(file);
  }
});
