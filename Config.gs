const CONFIG = Object.freeze({
  APP_VERSION: '0.1.0',
  // Classeur contenant les onglets IMPORT DONNEES (faits) et BDD NOMS (dimension pôle).
  SPREADSHEET_ID: '1JLtSywWoSeeI_lA1O0YA-C_SKFdSwIaCQm_xLWl43c0',
  IMPORT_SHEET_NAME: 'IMPORT DONNEES',
  // Zone SYNTHESE : la ligne 1 est un titre fusionné, les en-têtes sont en
  // ligne 2. Les colonnes AM:AZ sont imposées car les en-têtes (Site, Action
  // envisagée...) se répètent à l'identique dans les autres zones de la
  // feuille (plans d'actions sites pilotes, etc.) : une recherche par nom
  // d'en-tête sans restriction de colonnes trouverait la mauvaise zone.
  IMPORT_HEADER_ROW: 2,
  IMPORT_SYNTHESE_FIRST_COLUMN: 'AM',
  IMPORT_SYNTHESE_LAST_COLUMN: 'AZ',
  POLE_REFERENCE_SHEET_NAME: 'BDD NOMS',
  // Liens par filière (onglet renommé le 08/10/2026) : B = libellé, C = code
  // filière, D = lien outil, E = lien outil bis, F = lien vers la liste des
  // référents (chips intelligentes). Lecture arrêtée à l'intertitre
  // « Outils non utilisés ». Lu via le service avancé Sheets
  // (cf. ToolLinksService.gs).
  TOOL_LINKS_SHEET_NAME: 'Liens outils référents',
  // Référentiel des actions (catalogue) : fait foi pour le poste
  // d'émissions de chaque action, les fichiers des pôles n'étant pas
  // toujours cohérents entre eux (cf. ActionReferenceService.gs).
  ACTIONS_REFERENCE_SHEET_NAME: 'BDD - Actions supplémentaires',
  // Archives mensuelles du "Tableau de bord VA" (copies manuelles, un onglet
  // par mois : "Archives 11/25", "Archives 09.26"...) et onglet de sortie
  // au format long, écrit DANS LE CLASSEUR DES ARCHIVES (cf.
  // ArchiveImportService.gs). ARCHIVES_SPREADSHEET_ID vide = même classeur
  // que SPREADSHEET_ID ; pour le classeur dédié "Archives REPORTING
  // NATIONAL", y coller son ID (la partie entre /d/ et /edit de l'URL).
  ARCHIVES_SPREADSHEET_ID: '1iUIbQYPfBAYJDTqqg2oO75zMHcbJoIEBbtqQ_IyvM5k', // Archives REPORTING NATIONAL
  ARCHIVES_SHEET_PREFIX: 'Archives',
  HISTORY_SHEET_NAME: 'HISTORIQUE TDB VA',
  TOOL_LINKS_RANGE: 'B2:F',
  // Données de la protection de l'enfance, produites dans un autre outil et
  // absentes d'IMPORT DONNEES : onglet du classeur national contenant un
  // tableau brut et un tableau retravaillé (cf. ProtEnfanceService.gs).
  PROT_ENFANCE_SHEET_NAME: 'PROT ENFANCE',
  PROT_ENFANCE_FILIERE: 'PROT ENFANCE',
  // Classeur « Synthèse référents Environnement » (vue Référents, cf.
  // ReferentsService.gs) : photographies datées du taux de couverture par
  // filière, et liste des référents par pôle.
  REFERENTS_SPREADSHEET_ID: '1dqBJ4ghIJ7vqlJLBW3-Ou5fnE6U0l7O7wwPXIsuhdIc',
  REFERENTS_EVOLUTION_SHEET_NAME: 'Evolution référents',
  REFERENTS_LIST_SHEET_NAME: 'IMPORT REFERENTS',
  HEADER_ROW: 1,
  MAX_PREVIEW_ROWS: 50,
  // Cache applicatif des droits (mis en place lors de l'ajout de la couche droits).
  RIGHTS_CACHE_TTL_SECONDS: 300
});

function getConfig_() {
  if (!CONFIG.SPREADSHEET_ID) {
    throw new Error('CONFIG.SPREADSHEET_ID doit être renseigné.');
  }

  if (!CONFIG.IMPORT_SHEET_NAME) {
    throw new Error('CONFIG.IMPORT_SHEET_NAME doit être renseigné.');
  }

  if (!CONFIG.POLE_REFERENCE_SHEET_NAME) {
    throw new Error('CONFIG.POLE_REFERENCE_SHEET_NAME doit être renseigné.');
  }

  return CONFIG;
}
