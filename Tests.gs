// Tests à lancer DEPUIS L'ÉDITEUR APPS SCRIPT (aucune installation) :
// sélectionner lancerTests puis Exécuter, et lire le journal d'exécution.
// À faire après chaque copie de fichiers, avant de redéployer.
//
// Trois volets :
// 1. installation : chaque fonction attendue existe (un fichier oublié ou
//    écrasé lors d'un copier-coller — ex. WebApp.gs sans doGet — est
//    signalé ici plutôt qu'au déploiement) ;
// 2. fonctions de calcul : jeux de données fabriqués, résultats attendus ;
// 3. données réelles : chargement complet du dashboard et contrôles de
//    cohérence (territoires par filière, mois de l'historique…).
// Les tests d'interface (navigateur) ne peuvent pas tourner dans Apps
// Script : ils tournent sur GitHub (dossier tests/, cf. README.md).
function lancerTests() {
  const results = [];
  const check = (label, condition, detail) => {
    results.push({label, ok: Boolean(condition), detail: detail || ''});
  };
  const safely = (label, fn) => {
    try {
      fn();
    } catch (error) {
      results.push({label, ok: false, detail: `erreur : ${error.message}`});
    }
  };

  // 1. Installation
  const expected = {
    'WebApp.gs': ['doGet'],
    'Config.gs': ['getConfig_'],
    'Utils.gs': ['openSpreadsheet_', 'readSheetTable_', 'findColumnIndex_', 'cleanActionLabel_'],
    'IdentityService.gs': ['isAllowedIdentityEmail_', 'getActiveUserEmail_'],
    'PoleReferenceService.gs': ['getPoleReference_'],
    'IndicatorService.gs': ['getDashboardBootstrap', 'getFactRecords_', 'diagnosticDashboard'],
    'ActionReferenceService.gs': ['getActionCatalogue_'],
    'ToolLinksService.gs': ['getToolLinks_'],
    'HistoryService.gs': ['getHistoryForDashboard_', 'historyMonthKey_'],
    'ArchiveImportService.gs': ['importArchivesTableauDeBord', 'actualiserHistoriqueSiModifie', 'parseArchiveValues_', 'archiveMonthFromName_'],
    'ProtEnfanceService.gs': ['getProtEnfanceFacts_', 'parseProtEnfanceValues_'],
    'ReferentsService.gs': ['getReferentsForDashboard_', 'parseReferentsList_']
  };
  const scope = typeof globalThis !== 'undefined' ? globalThis : this;
  Object.keys(expected).forEach((file) => {
    const missing = expected[file].filter((name) => typeof scope[name] !== 'function');
    check(`Installation : ${file}`, missing.length === 0, missing.length ? `fonction(s) absente(s) : ${missing.join(', ')}` : '');
  });

  // 2. Fonctions de calcul
  safely('Libellé « Action socle - Repas végétariens »', () => {
    check('Libellé « Action socle - Repas végétariens »', cleanActionLabel_('Action socle - Repas végétariens') === 'Repas végétariens');
  });
  safely('Mois d\'un onglet d\'archive', () => {
    const cases = {'Archives 1125': '2025-11', 'Archives 09.26': '2026-09', 'Archives 01/26 2': '2026-01'};
    const wrong = Object.keys(cases).filter((name) => archiveMonthFromName_(name) !== cases[name]);
    check('Mois d\'un onglet d\'archive', wrong.length === 0, wrong.join(', '));
  });
  safely('Colonne en double : la mieux remplie gagne', () => {
    const table = {headers: ['Code', 'Territoire', 'Territoire'], rows: [['A', 'Territoire A', ''], ['B', 'Territoire B', '']]};
    check('Colonne en double : la mieux remplie gagne', findColumnIndex_(table, 'territoire') === 1);
  });
  safely('Mois relu comme date ramené à AAAA-MM', () => {
    check('Mois relu comme date ramené à AAAA-MM', historyMonthKey_(new Date(2026, 8, 1)) === '2026-09');
  });
  safely('Import d\'archive (indicateurs DIP écartés)', () => {
    const parsed = parseArchiveValues_([
      ['', '', '', '', 'TOTAL', 'SANITAIRE'],
      ['', '', 'Nombre total de structures', '', 20, 19],
      ['', '', 'TX DE TERMINES PARMIS LES CONCERNES', '', '', 'SANITAIRE'],
      ['', '', '', '', 'TOTAL', '%', '# terminés', '# réponses concernés'],
      ['', 'Actions socles 2024', 'Repas végétariens', '', 0.5, 0.6, 6, 10],
      ['', '', 'Voitures électriques', 'Indic. DIP', '', 0, 0, 60],
      ['', '', '', '', '', '', '', '']
    ], 'Archives 09/26');
    const ok = parsed.rows.some((r) => r[3] === 'Repas végétariens' && r[5] === 'SAN' && r[6] === 'terminees' && r[7] === 6) &&
      !parsed.rows.some((r) => r[3] === 'Voitures électriques');
    check('Import d\'archive (indicateurs DIP écartés)', ok);
  });

  // 3. Données réelles
  safely('Chargement du dashboard', () => {
    const bootstrap = getDashboardBootstrap();
    check('Chargement du dashboard', bootstrap.facts.rows.length > 0 && bootstrap.poles.length > 0,
      `${bootstrap.facts.rows.length} lignes, ${bootstrap.poles.length} pôles`);
    check('Aucun avertissement de données', bootstrap.diagnostics.warnings.length === 0, bootstrap.diagnostics.warnings.join(' | '));

    const byFiliere = {};
    bootstrap.poles.forEach((pole) => {
      byFiliere[pole.filiere] = byFiliere[pole.filiere] || {};
      if (pole.territoire) byFiliere[pole.filiere][pole.territoire] = true;
    });
    Object.keys(byFiliere).sort().forEach((filiere) => {
      const territoires = Object.keys(byFiliere[filiere]);
      check(`Territoires de la filière ${filiere || '(vide)'}`, territoires.length > 0, territoires.length ? territoires.join(', ') : 'aucun territoire');
    });

    const badMonths = bootstrap.history.rows.filter((row) => !/^\d{4}-\d{2}$/.test(row[0]));
    check('Historique : mois au format AAAA-MM', bootstrap.history.rows.length > 0 && badMonths.length === 0,
      `${bootstrap.history.rows.length} valeurs${badMonths.length ? `, ${badMonths.length} mois mal formés` : ''}`);
  });

  const failures = results.filter((result) => !result.ok);
  Logger.log(results.map((result) => `${result.ok ? '✅' : '❌'} ${result.label}${result.detail ? ' — ' + result.detail : ''}`).join('\n'));
  Logger.log(failures.length ? `${failures.length} test(s) en échec sur ${results.length}.` : `Tous les tests passent (${results.length}).`);
  return {total: results.length, echecs: failures.length};
}
