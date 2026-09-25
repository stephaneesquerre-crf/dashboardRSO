// Liens vers les outils de suivi par filière (onglet "Liens outils").
// Les liens sont des chips intelligentes Google Sheets : ni
// getRichTextValues().getLinkUrl() ni getFormulas() ne les exposent, seule
// l'API Sheets (champ chipRuns, disponible depuis juin 2025) les lit —
// d'où le service avancé "Sheets", à activer dans l'éditeur Apps Script
// (Services > Google Sheets API, identifiant "Sheets").
//
// Ne fait jamais échouer le chargement du dashboard : service non activé,
// onglet absent ou erreur d'API -> liste vide et avertissement au journal.
function getToolLinks_() {
  const config = getConfig_();
  if (typeof Sheets === 'undefined') {
    console.warn('Liens outils : service avancé Sheets non activé, liens ignorés.');
    return [];
  }

  try {
    const response = Sheets.Spreadsheets.get(config.SPREADSHEET_ID, {
      ranges: [`'${config.TOOL_LINKS_SHEET_NAME}'!${config.TOOL_LINKS_RANGE}`],
      fields: 'sheets(data(rowData(values(formattedValue,userEnteredValue,hyperlink,chipRuns))))'
    });
    const rows = (((response.sheets || [])[0] || {}).data || [])[0];
    return ((rows && rows.rowData) || [])
      .map((row) => parseToolLinkRow_(row.values || []))
      .filter(Boolean);
  } catch (error) {
    console.warn(`Liens outils : lecture impossible (${error.message}).`);
    return [];
  }
}

// B = libellé, C = code filière, D = lien. Une ligne sans URL exploitable
// (en-tête, ligne vide, intertitre "Outils spécifiques") est ignorée.
function parseToolLinkRow_(cells) {
  const text = (cell) => cleanValue_(cell && (cell.formattedValue ||
    (cell.userEnteredValue && cell.userEnteredValue.stringValue)));
  const linkCell = cells[2] || {};
  const chipUrl = (linkCell.chipRuns || [])
    .map((run) => run.chip && run.chip.richLinkProperties && run.chip.richLinkProperties.uri)
    .find(Boolean);
  const url = cleanValue_(chipUrl || linkCell.hyperlink);
  // Seuls les liens web sont gardés : l'URL finit dans un href côté client.
  if (!/^https:\/\//i.test(url)) {
    return null;
  }
  return {
    label: text(cells[0]),
    filiereCode: text(cells[1]),
    title: text(linkCell) || text(cells[0]),
    url: url
  };
}

// À exécuter manuellement : affiche les liens lus et signale les codes
// filière de la colonne C qui ne correspondent à aucune filière de BDD NOMS
// (ces liens ne s'afficheraient jamais dans le dashboard).
function testToolLinks() {
  const links = getToolLinks_();
  const filieres = {};
  Object.values(getPoleReference_()).forEach((pole) => { filieres[normalizeText_(pole.filiere)] = true; });
  // PA et DOM n'existent pas dans BDD NOMS (regroupés sous PADOM) mais sont
  // des filières du dashboard après reclassement (cf. derivePadomOverrides_).
  filieres.pa = true;
  filieres.dom = true;
  links.forEach((link) => {
    const known = filieres[normalizeText_(link.filiereCode)] ? 'ok' : 'FILIERE INCONNUE';
    Logger.log(`${link.filiereCode} | ${link.title} | ${known}`);
  });
  Logger.log(`${links.length} lien(s) lu(s).`);
}
