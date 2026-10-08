// Liens par filière (onglet « Liens outils référents », B:F) : outil de
// suivi, outil bis et liste des référents environnement. Les liens sont des
// chips intelligentes Google Sheets : ni getRichTextValues().getLinkUrl() ni
// getFormulas() ne les exposent, seule l'API Sheets (champ chipRuns,
// disponible depuis juin 2025) les lit — d'où le service avancé "Sheets",
// à activer dans l'éditeur Apps Script (Services > Google Sheets API,
// identifiant "Sheets").
//
// Ne fait jamais échouer le chargement du dashboard : service non activé,
// onglet absent ou erreur d'API -> liste vide et avertissement.
function getToolLinks_() {
  const config = getConfig_();
  if (typeof Sheets === 'undefined') {
    addDiagnosticWarning_('Liens outils : service avancé Sheets non activé, liens ignorés.');
    return [];
  }

  try {
    const response = Sheets.Spreadsheets.get(config.SPREADSHEET_ID, {
      ranges: [`'${config.TOOL_LINKS_SHEET_NAME}'!${config.TOOL_LINKS_RANGE}`],
      fields: 'sheets(data(rowData(values(formattedValue,userEnteredValue,hyperlink,chipRuns))))'
    });
    const rows = ((((response.sheets || [])[0] || {}).data || [])[0] || {}).rowData || [];
    return parseToolLinkRows_(rows.map((row) => row.values || []));
  } catch (error) {
    addDiagnosticWarning_(`Liens outils : lecture impossible (${error.message}).`);
    return [];
  }
}

const TOOL_LINK_KINDS_ = ['outil', 'outilBis', 'referents'];

// Une ligne = B libellé, C code filière, D lien outil, E lien outil bis,
// F lien référents. Lecture arrêtée à l'intertitre « Outils non utilisés »
// (les lignes en dessous ne doivent pas apparaître). Une ligne sans aucun
// lien web (en-tête, ligne vide, intertitre) est ignorée.
function parseToolLinkRows_(rows) {
  const text = (cell) => cleanValue_(cell && (cell.formattedValue ||
    (cell.userEnteredValue && cell.userEnteredValue.stringValue)));
  const urlOf = (cell) => {
    const chipUrl = ((cell && cell.chipRuns) || [])
      .map((run) => run.chip && run.chip.richLinkProperties && run.chip.richLinkProperties.uri)
      .find(Boolean);
    const url = cleanValue_(chipUrl || (cell && cell.hyperlink));
    // Seuls les liens web sont gardés : l'URL finit dans un href côté client.
    return /^https:\/\//i.test(url) ? url : '';
  };
  const result = [];
  for (let index = 0; index < rows.length; index += 1) {
    const cells = rows[index];
    if (normalizeText_(text(cells[0])).indexOf('outils non utilises') === 0) break;
    const links = TOOL_LINK_KINDS_
      .map((kind, offset) => ({kind, cell: cells[2 + offset]}))
      .map(({kind, cell}) => ({kind, title: text(cell), url: urlOf(cell)}))
      .filter((link) => link.url);
    if (!links.length) continue;
    links.forEach((link) => { if (!link.title) link.title = text(cells[0]); });
    result.push({label: text(cells[0]), filiereCode: text(cells[1]), links: links});
  }
  return result;
}

// À exécuter manuellement : affiche les liens lus et signale les codes
// filière de la colonne C qui ne correspondent à aucune filière de BDD NOMS
// (ces liens ne s'afficheraient jamais dans le dashboard).
function testToolLinks() {
  const rows = getToolLinks_();
  const filieres = {};
  Object.values(getPoleReference_()).forEach((pole) => { filieres[normalizeText_(pole.filiere)] = true; });
  // PA et DOM n'existent pas dans BDD NOMS (regroupés sous PADOM) mais sont
  // des filières du dashboard après reclassement (cf. derivePadomOverrides_).
  filieres.pa = true;
  filieres.dom = true;
  rows.forEach((row) => {
    const known = filieres[normalizeText_(row.filiereCode)] ? 'ok' : 'FILIERE INCONNUE';
    Logger.log(`${row.filiereCode} | ${row.links.map((link) => `${link.kind} : ${link.title}`).join(' ; ')} | ${known}`);
  });
  Logger.log(`${rows.length} ligne(s) avec lien(s).`);
}
