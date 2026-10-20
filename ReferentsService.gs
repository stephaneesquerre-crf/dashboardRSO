// Vue Référents : lecture du classeur « Synthèse référents Environnement »
// (REFERENTS_SPREADSHEET_ID).
// - onglet « Evolution référents » : photographies datées du taux de
//   couverture par filière (une ligne de dates, puis une ligne par filière) ;
// - onglet « IMPORT REFERENTS » : une ligne par pôle, avec code pôle (même
//   format que BDD NOMS) et référent·es 1, 2 (et 3 si la colonne existe).
// Repérage par le contenu (ligne de dates, en-tête « Code Pôle »), pas par
// numéros de ligne. Ne fait jamais échouer le chargement du dashboard.
function getReferentsForDashboard_(poleReference, toolLinks) {
  const config = getConfig_();
  const result = {evolution: [], poles: [], sources: []};
  let importPoles = [];
  let withoutCode = 0;
  try {
    const spreadsheet = openSpreadsheet_(config.REFERENTS_SPREADSHEET_ID);
    const evolutionSheet = spreadsheet.getSheetByName(config.REFERENTS_EVOLUTION_SHEET_NAME);
    if (evolutionSheet) {
      result.evolution = parseReferentsEvolution_(evolutionSheet.getDataRange().getValues());
    } else {
      addDiagnosticWarning_(`Référents : onglet « ${config.REFERENTS_EVOLUTION_SHEET_NAME} » introuvable.`);
    }
    const listSheet = spreadsheet.getSheetByName(config.REFERENTS_LIST_SHEET_NAME);
    if (listSheet) {
      const parsed = parseReferentsList_(listSheet.getDataRange().getValues());
      importPoles = parsed.poles;
      withoutCode = parsed.withoutCode;
      importPoles.forEach((pole) => { pole.source = config.REFERENTS_LIST_SHEET_NAME; });
    } else {
      addDiagnosticWarning_(`Référents : onglet « ${config.REFERENTS_LIST_SHEET_NAME} » introuvable.`);
    }
  } catch (error) {
    addDiagnosticWarning_(`Référents : classeur inaccessible (${error.message}).`);
  }

  // « IMPORT REFERENTS » regroupe les listes de toutes les filières (un bloc
  // par filière) : c'est la source principale. Les listes des filières
  // (colonne « Liens référents » de « Liens outils référents ») ne sont
  // ouvertes que pour une filière absente de l'onglet — sinon chaque
  // fichier ralentirait le chargement pour rien.
  const importFilieres = {};
  importPoles.forEach((pole) => { importFilieres[pole.filiere] = (importFilieres[pole.filiere] || 0) + 1; });
  result.sources.push({filiere: Object.keys(importFilieres).join(', '), title: config.REFERENTS_LIST_SHEET_NAME, url: '', ok: importPoles.length > 0, poles: importPoles.length, detail: 'liste principale'});
  const missingLinks = (toolLinks || []).filter((row) => row.filiereCode && !importFilieres[mapReferentsFiliere_(row.filiereCode)]);
  const linked = readLinkedReferentsLists_(missingLinks);
  result.sources = result.sources.concat(linked.sources);
  result.poles = importPoles.concat(linked.poles);

  // Codes pôle rapprochés de BDD NOMS (referenceCode) : territoire de la
  // vue Référents ; codes inconnus regroupés par filière pour savoir où
  // corriger.
  const index = buildPoleCodeIndex_(poleReference);
  const unknown = [];
  result.poles.forEach((pole) => {
    const match = matchPoleCode_(pole.poleCode, poleReference, index);
    if (match) {
      pole.referenceCode = match.poleCode;
      pole.territoire = match.territoire || '';
    } else {
      unknown.push(pole);
    }
  });
  if (unknown.length) {
    const byFiliere = {};
    unknown.forEach((pole) => { (byFiliere[pole.filiere] = byFiliere[pole.filiere] || []).push(pole.poleCode); });
    const detail = Object.keys(byFiliere).sort()
      .map((filiere) => `${filiere} : ${byFiliere[filiere].join(', ')}`)
      .join(' ; ');
    addDiagnosticWarning_(`Référents : ${unknown.length} code(s) pôle absent(s) de BDD NOMS (comptés sans territoire) — ${detail}.`);
  }
  if (withoutCode) {
    addDiagnosticWarning_(`Référents : ${withoutCode} ligne(s) de pôle sans code ignorée(s) dans « ${config.REFERENTS_LIST_SHEET_NAME} ».`);
  }
  return result;
}

// Numéros d'établissement d'un code pôle (« Territoire B : GE_4325 4357 » ->
// ['4325', '4357']), sans le suffixe « - 1 » / « - 2 » qui distingue
// plusieurs établissements d'un même pôle.
function poleCodeNumbers_(code) {
  const text = cleanValue_(code).replace(/\s+-\s*\d{1,2}\s*$/, '');
  const afterTerritory = text.indexOf('_') === -1 ? '' : text.slice(text.indexOf('_') + 1);
  const numbers = afterTerritory.match(/\d+/g) || [];
  return numbers.filter((number, position) => numbers.indexOf(number) === position).sort();
}

// {numéros triés -> pôle BDD NOMS}, seulement pour des clés sans ambiguïté.
function buildPoleCodeIndex_(poleReference) {
  const index = {};
  const ambiguous = {};
  Object.keys(poleReference).forEach((key) => {
    const numbers = poleCodeNumbers_(poleReference[key].poleCode).join(' ');
    if (!numbers) return;
    if (index[numbers] && index[numbers] !== poleReference[key]) ambiguous[numbers] = true;
    index[numbers] = poleReference[key];
  });
  Object.keys(ambiguous).forEach((numbers) => { delete index[numbers]; });
  return index;
}

// Pôle de BDD NOMS correspondant à un code de la liste des référents :
// code identique, sinon code sans le suffixe « - n », sinon mêmes numéros
// d'établissement (le libellé du territoire diffère parfois entre la liste
// et BDD NOMS).
function matchPoleCode_(code, poleReference, index) {
  const exact = poleReference[normalizeText_(code)];
  if (exact) return exact;
  const withoutSuffix = poleReference[normalizeText_(cleanValue_(code).replace(/\s+-\s*\d{1,2}\s*$/, ''))];
  if (withoutSuffix) return withoutSuffix;
  const numbers = poleCodeNumbers_(code).join(' ');
  return numbers ? index[numbers] || null : null;
}

// ID d'un classeur Google Sheets à partir de son URL, ou ''.
function spreadsheetIdFromUrl_(url) {
  const match = String(url || '').match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : '';
}

// Lit chaque classeur « Liens référents » une seule fois (PADOM : un
// fichier pour PA et DOM). Dans chaque classeur, premier onglet dont une
// des 20 premières lignes contient l'en-tête « Code pôle » ; filière lue
// dans la colonne Filière si elle existe, sinon code filière du lien.
// Ne fait jamais échouer le chargement : fichier inaccessible (droits,
// fichier Excel, autre format) -> source signalée et ignorée.
function readLinkedReferentsLists_(toolLinks) {
  const byId = {};
  toolLinks.forEach((row) => {
    (row.links || []).filter((link) => link.kind === 'referents').forEach((link) => {
      const id = spreadsheetIdFromUrl_(link.url);
      const key = id || link.url;
      if (!byId[key]) byId[key] = {id, title: link.title, url: link.url, filieres: []};
      if (row.filiereCode && byId[key].filieres.indexOf(row.filiereCode) === -1) byId[key].filieres.push(row.filiereCode);
    });
  });
  const sources = [];
  const poles = [];
  const seen = {};
  Object.keys(byId).forEach((key) => {
    const source = byId[key];
    const report = {filiere: source.filieres.join(', '), title: source.title, url: source.url, ok: false, poles: 0, detail: ''};
    sources.push(report);
    if (!source.id) {
      report.detail = 'lien qui n\'est pas un classeur Google Sheets';
      return;
    }
    let spreadsheet;
    try {
      spreadsheet = openSpreadsheet_(source.id);
    } catch (error) {
      report.detail = `classeur inaccessible (${error.message})`;
      DASHBOARD_DIAGNOSTICS_.accessLinks = DASHBOARD_DIAGNOSTICS_.accessLinks || [];
      DASHBOARD_DIAGNOSTICS_.accessLinks.push({key: `referents-${key}`, label: `${source.title} (liste des référents ${report.filiere})`, url: source.url, required: false});
      return;
    }
    const sheets = spreadsheet.getSheets();
    for (let index = 0; index < sheets.length; index += 1) {
      const values = sheets[index].getDataRange().getValues();
      if (findReferentsHeaderRow_(values) === -1) continue;
      const parsed = parseReferentsList_(values, source.filieres.length === 1 ? source.filieres[0] : '');
      report.withReferents = 0;
      parsed.poles.forEach((pole) => {
        const code = normalizeText_(pole.poleCode);
        if (seen[code]) return;
        seen[code] = true;
        pole.source = source.title;
        poles.push(pole);
        report.poles += 1;
        if (pole.referents.length) report.withReferents += 1;
      });
      report.ok = true;
      report.detail = `onglet « ${sheets[index].getName()} » ; colonnes référent·es : ${parsed.referentHeaders.join(' | ') || 'AUCUNE TROUVÉE'}`;
      if (!parsed.referentHeaders.length) {
        addDiagnosticWarning_(`Référents : liste « ${source.title} » lue mais aucune colonne de référent·e reconnue.`);
      }
      break;
    }
    if (!report.ok) report.detail = 'aucun onglet avec un en-tête « Code pôle »';
  });
  sources.filter((source) => !source.ok).forEach((source) => {
    addDiagnosticWarning_(`Référents : liste « ${source.title} » (${source.filiere}) non lue — ${source.detail}.`);
  });
  return {poles, sources};
}

function findReferentsHeaderRow_(values) {
  const limit = Math.min(values.length, 20);
  for (let row = 0; row < limit; row += 1) {
    if (values[row].some((cell) => normalizeText_(cell).indexOf('code pole') === 0)) return row;
  }
  return -1;
}

// Libellés de filière du classeur des référents -> filière du dashboard.
const REFERENTS_FILIERE_ALIASES_ = {
  'sanitaire': 'SAN',
  'handicap': 'PSH',
  'protection de lenfance': 'PROT ENFANCE',
  'petite enfance': 'PET E',
  'personnes agees': 'PA',
  'padom-pa': 'PA',
  'padom-dom': 'DOM',
  // « DNOM » dans l'onglet « Evolution référents » = filière DOM (PADOM -
  // domicile), « PADOM-DOM » dans la liste (constat du 20/10/2026).
  'dnom': 'DOM',
  'padom pa': 'PA',
  'padom dom': 'DOM',
  // Libellés des listes des filières (journal du 20/10/2026).
  'prot.e.': 'PROT ENFANCE',
  'prot. e.': 'PROT ENFANCE',
  'prot.e': 'PROT ENFANCE',
  'prot e': 'PROT ENFANCE',
  'protection enfance': 'PROT ENFANCE',
  'pe': 'PET E',
  'p.e.': 'PET E',
  'pet. enf.': 'PET E',
  'pet e': 'PET E',
  'pet. e.': 'PET E',
  'handicap psh': 'PSH',
  'san': 'SAN',
  'psh': 'PSH',
  'crc': 'CRC',
  'flex': 'FLEX',
  'pa': 'PA',
  'dom': 'DOM'
};

function mapReferentsFiliere_(label) {
  const key = normalizeText_(label).replace(/’/g, '');
  return REFERENTS_FILIERE_ALIASES_[key] || cleanValue_(label);
}

// [{filiere, label, points: [[AAAA-MM-JJ, taux 0-1]]}]
function parseReferentsEvolution_(values) {
  const isDate = (value) => Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime());
  const datesRow = values.findIndex((row) => row.filter(isDate).length >= 3);
  if (datesRow === -1) {
    addDiagnosticWarning_('Référents : aucune ligne de dates dans l\'onglet d\'évolution.');
    return [];
  }
  const dateCols = [];
  values[datesRow].forEach((cell, col) => {
    if (isDate(cell)) dateCols.push({col, date: Utilities.formatDate(cell, Session.getScriptTimeZone(), 'yyyy-MM-dd')});
  });
  const labelCol = Math.max(0, dateCols[0].col - 1);
  const series = [];
  for (let row = datesRow + 1; row < values.length; row += 1) {
    const label = cleanValue_(values[row][labelCol]);
    if (!label) break;
    const points = dateCols
      .filter(({col}) => typeof values[row][col] === 'number' && isFinite(values[row][col]))
      .map(({col, date}) => [date, values[row][col]]);
    if (points.length) series.push({filiere: mapReferentsFiliere_(label), label, points});
  }
  return series;
}

// {poles: [{poleCode, poleName, filiere, directeur, referents: [{name, email, fonction}], dateMaj}], withoutCode}
// defaultFiliere : filière à utiliser quand le fichier n'a pas de colonne
// Filière ou qu'elle est vide (listes propres à une filière).
//
// L'onglet « IMPORT REFERENTS » empile un bloc par filière (constat du
// 20/10/2026) : ligne d'en-tête, lignes des pôles, ligne « LIGNE DE FIN
// DES DONNEES », puis des lignes de synthèse (« Nb pôles/ établissements »,
// « taux de couverture… », FAIT / A FAIRE…) et parfois un intertitre. Chaque
// bloc est lu avec ses propres colonnes (l'en-tête du bloc CRC dit « Code »
// et non « Code Pôle ») ; les lignes entre une ligne de fin et l'en-tête
// suivant sont ignorées.
function parseReferentsList_(values, defaultFiliere) {
  const blocks = [];
  let current = null;
  values.forEach((row) => {
    if (isReferentsHeaderRow_(row)) {
      current = {header: row, rows: []};
      blocks.push(current);
      return;
    }
    if (!current) return;
    if (row.some((cell) => normalizeText_(cell).indexOf('ligne de fin des donnees') !== -1)) {
      current = null;
      return;
    }
    current.rows.push(row);
  });
  if (!blocks.length) {
    addDiagnosticWarning_('Référents : en-tête « Code Pôle » introuvable dans la liste.');
    return {poles: [], withoutCode: 0, referentHeaders: []};
  }
  const result = {poles: [], withoutCode: 0, referentHeaders: []};
  // Lignes en double (le bloc Petite enfance figure deux fois dans
  // l'onglet) : une seule fois.
  const seen = {};
  blocks.forEach((block) => {
    const parsed = parseReferentsBlock_(block.header, block.rows, defaultFiliere);
    parsed.poles.forEach((pole) => {
      const key = [pole.filiere, pole.poleCode, pole.poleName, (pole.referents[0] || {}).name || ''].map(normalizeText_).join('|');
      if (seen[key]) return;
      seen[key] = true;
      result.poles.push(pole);
    });
    result.withoutCode += parsed.withoutCode;
    parsed.referentHeaders.forEach((header) => {
      if (result.referentHeaders.indexOf(header) === -1) result.referentHeaders.push(header);
    });
  });
  return result;
}

// En-tête d'un bloc : une cellule « Code pôle », ou « Code » à côté d'une
// cellule « Filière ».
function isReferentsHeaderRow_(row) {
  const cells = row.map((cell) => normalizeText_(cell));
  return cells.some((cell) => cell.indexOf('code pole') === 0) ||
    (cells.indexOf('code') !== -1 && cells.indexOf('filiere') !== -1);
}

function parseReferentsBlock_(headerCells, rows, defaultFiliere) {
  const table = {headers: headerCells.map((cell) => cleanValue_(cell)), rows: rows};
  const col = {
    filiere: findColumnIndex_(table, 'filiere'),
    // Intitulés essayés dans l'ordre (« Nom » seul en dernier recours :
    // il pourrait aussi désigner le nom d'un·e référent·e).
    poleName: ['nom pole', 'nom du pole', 'nom de la structure', 'etablissement', 'structure', 'nom']
      .map((prefix) => findColumnIndex_(table, prefix)).concat([-1]).find((index, position, all) => index !== -1 || position === all.length - 1),
    poleCode: ['code pole', 'code']
      .map((prefix) => findColumnIndex_(table, prefix)).concat([-1]).find((index, position, all) => index !== -1 || position === all.length - 1),
    dateMaj: findColumnIndex_(table, 'date maj'),
    // « DT (directeur territorial) » : texte libre, parfois deux noms
    // (« X / Y (appui) »), affiché tel quel.
    directeur: findColumnIndex_(table, ['dt (directeur', 'directeur territorial', 'directrice territoriale'])
  };
  const referentCols = findReferentColumns_(table);

  const poles = [];
  let withoutCode = 0;
  table.rows.forEach((row) => {
    const filiere = cellAt_(row, col.filiere) || cleanValue_(defaultFiliere);
    const poleCode = cellAt_(row, col.poleCode);
    // Lignes de titre répétées, lignes vides.
    if (!filiere || normalizeText_(filiere) === 'filiere' || normalizeText_(poleCode).indexOf('code') === 0) return;
    if (!poleCode && !cellAt_(row, col.poleName)) return;
    if (!poleCode) {
      withoutCode += 1;
      return;
    }
    const dateValue = col.dateMaj === -1 ? '' : row[col.dateMaj];
    poles.push({
      poleCode,
      poleName: cellAt_(row, col.poleName),
      filiere: mapReferentsFiliere_(filiere),
      directeur: cellAt_(row, col.directeur),
      // Un·e référent·e est compté·e dès que son nom OU son adresse mail est
      // renseigné (constat du 08/10/2026 : pour PADOM, le nom est souvent
      // vide alors que l'adresse et « Référent.e Oui/Non » = OUI le sont).
      referents: referentCols
        .map((ref) => ({name: cellAt_(row, ref.name), email: cellAt_(row, ref.email), fonction: cellAt_(row, ref.fonction)}))
        .filter((ref) => ref.name || ref.email),
      dateMaj: Object.prototype.toString.call(dateValue) === '[object Date]'
        ? Utilities.formatDate(dateValue, Session.getScriptTimeZone(), 'yyyy-MM-dd')
        : cleanValue_(dateValue)
    });
  });
  return {poles, withoutCode, referentHeaders: referentCols.map((ref) => [ref.name, ref.email, ref.fonction]
    .filter((index) => index !== -1).map((index) => table.headers[index]).join(' / '))};
}

// Colonnes des référent·es 1, 2, 3 (nom, adresse mail, fonction). Les
// listes des filières n'ont pas toutes les intitulés de « IMPORT
// REFERENTS » (« Référent.e 1 », « Adresse mail (réf. 1) ») : on accepte
// aussi « Référent 1 », « Référent·e n°1 », « Mail référent 1 »… et, à
// défaut de numéro, une seule colonne « Référent… » (+ « mail »).
function findReferentColumns_(table) {
  const headers = table.headers.map((header) => normalizeText_(header));
  const isOther = (header) => /mail|fonction|oui|date|tel|poste|statut/.test(header);
  const rankOf = (header) => {
    const match = header.match(/(?:ref(?:erent)?\S*|n°|no)\s*\.?\s*(\d)\b/) || header.match(/\b(\d)\b/);
    return match ? Number(match[1]) : null;
  };
  const pick = (test) => {
    const candidates = headers.map((header, index) => (test(header) ? index : -1)).filter((index) => index !== -1);
    if (candidates.length <= 1) return candidates.length ? candidates[0] : -1;
    const filled = (index) => table.rows.filter((row) => cleanValue_(row[index])).length;
    return candidates.reduce((best, index) => (filled(index) > filled(best) ? index : best), candidates[0]);
  };
  const ranked = [1, 2, 3].map((rank) => ({
    name: pick((header) => header.indexOf('referent') !== -1 && !isOther(header) && rankOf(header) === rank),
    email: pick((header) => header.indexOf('mail') !== -1 && rankOf(header) === rank),
    fonction: pick((header) => header.indexOf('fonction') !== -1 && rankOf(header) === rank)
  })).filter((ref) => ref.name !== -1 || ref.email !== -1);
  if (ranked.length) return ranked;
  const single = {
    name: pick((header) => header.indexOf('referent') !== -1 && !isOther(header)),
    email: pick((header) => header.indexOf('mail') !== -1),
    fonction: pick((header) => header.indexOf('fonction') !== -1)
  };
  return single.name !== -1 || single.email !== -1 ? [single] : [];
}

// À lancer depuis l'éditeur : pour chaque liste « Liens référents », onglet
// lu et nombre de pôles, ou raison de l'échec (droits, en-tête introuvable).
function testListesReferents() {
  const toolLinks = getToolLinks_();
  const result = getReferentsForDashboard_(getPoleReference_(), toolLinks);
  result.sources.forEach((source) => {
    Logger.log(`${source.ok ? 'OK ' : 'NON'} | ${source.filiere || '-'} | ${source.title} | ${source.poles} pôle(s)${typeof source.withReferents === 'number' ? `, dont ${source.withReferents} avec référent·e` : ''} | ${source.detail}`);
  });
  const byFiliere = {};
  result.poles.forEach((pole) => { byFiliere[pole.filiere] = (byFiliere[pole.filiere] || 0) + 1; });
  Logger.log(`Pôles par filière : ${JSON.stringify(byFiliere)}`);
  DASHBOARD_DIAGNOSTICS_.warnings.forEach((warning) => Logger.log(`⚠ ${warning}`));
}
