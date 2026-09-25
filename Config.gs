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
  // Liens vers les outils de suivi par filière : colonne B = libellé,
  // C = code filière (tel qu'affiché dans le dashboard), D = lien sous forme
  // de chip intelligente. Plage ouverte vers le bas pour absorber les
  // ajouts de lignes. Lu via le service avancé Sheets (cf. ToolLinksService.gs).
  TOOL_LINKS_SHEET_NAME: 'Liens outils',
  TOOL_LINKS_RANGE: 'B2:D',
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
