const CONFIG = Object.freeze({
  APP_VERSION: '0.1.0',
  // Classeur contenant les onglets IMPORT DONNEES (faits) et BDD NOMS (dimension pôle).
  SPREADSHEET_ID: '1JLtSywWoSeeI_lA1O0YA-C_SKFdSwIaCQm_xLWl43c0',
  IMPORT_SHEET_NAME: 'IMPORT DONNEES',
  POLE_REFERENCE_SHEET_NAME: 'BDD NOMS',
  HEADER_ROW: 1,
  MAX_PREVIEW_ROWS: 50,
  MAX_DASHBOARD_ROWS: 5000,
  MAX_REFERENCE_ROWS: 1000,
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
