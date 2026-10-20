// Lecture de l'onglet HISTORIQUE TDB VA (produit par
// importArchivesTableauDeBord, cf. ArchiveImportService.gs) pour la vue
// Évolution. Envoyé au client sous forme compacte (tableaux plutôt
// qu'objets) pour limiter la taille du chargement.
//
// Mois en double (deux onglets d'archive pour un même mois, ex.
// "Archives 01/26" et "Archives 01/26 2") : on ne garde que l'onglet au
// nom le plus court, puis le premier par ordre alphabétique — règle
// simple et prévisible, signalée dans le README.
//
// Ne fait jamais échouer le chargement du dashboard : classeur ou onglet
// inaccessible -> historique vide et avertissement au journal.
function getHistoryForDashboard_() {
  const config = getConfig_();
  try {
    const spreadsheet = openSpreadsheet_(config.ARCHIVES_SPREADSHEET_ID || config.SPREADSHEET_ID);
    const sheet = spreadsheet.getSheetByName(config.HISTORY_SHEET_NAME);
    if (!sheet || sheet.getLastRow() < 2) {
      addDiagnosticWarning_(`Historique : onglet ${config.HISTORY_SHEET_NAME} absent ou vide — lancer importArchivesTableauDeBord().`);
      return {rows: []};
    }
    const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, HISTORY_HEADERS_.length).getValues();

    // Google Sheets convertit "2026-09" en date à l'écriture (constaté le
    // 30/09/2026 : mois relu comme "Tue Sep 01 2026 … GMT+0200") : on
    // ramène toute date au format "AAAA-MM" avant tout traitement.
    values.forEach((row) => { row[0] = historyMonthKey_(row[0]); });

    const sourcesByMonth = {};
    values.forEach((row) => {
      const month = cleanValue_(row[0]);
      const source = cleanValue_(row[1]);
      if (!month) return;
      sourcesByMonth[month] = sourcesByMonth[month] || {};
      sourcesByMonth[month][source] = true;
    });
    const keptSource = {};
    Object.keys(sourcesByMonth).forEach((month) => {
      keptSource[month] = Object.keys(sourcesByMonth[month])
        .sort((left, right) => left.length - right.length || left.localeCompare(right))[0];
    });

    // [mois, campagne, action, filière, indicateur, valeur]
    const rows = values
      .filter((row) => cleanValue_(row[0]) && keptSource[cleanValue_(row[0])] === cleanValue_(row[1]) && typeof row[7] === 'number')
      .map((row) => [cleanValue_(row[0]), cleanValue_(row[2]), cleanValue_(row[3]), cleanValue_(row[5]), cleanValue_(row[6]), row[7]]);
    // Date de la dernière actualisation (cf. refreshHistory_), affichée dans
    // la vue Évolution ; absente si l'historique n'a été produit que par
    // une ancienne version de l'import.
    const refreshedAt = PropertiesService.getScriptProperties().getProperty(HISTORY_REFRESHED_AT_PROPERTY_) || '';
    return {rows: rows, refreshedAt: refreshedAt};
  } catch (error) {
    addDiagnosticWarning_(`Historique : lecture impossible (${error.message}) — vérifier l'accès au classeur des archives.`);
    return {rows: []};
  }
}

function historyMonthKey_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM');
  }
  return cleanValue_(value);
}
