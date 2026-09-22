function cleanValue_(value) {
  return String(value == null ? '' : value).trim();
}

// Les en-têtes du classeur mélangent apostrophes typographiques (’) et
// droites ('), et notent parfois un même champ avec un underscore ou un
// espace (« code_pôle » / « Code pôle »). On neutralise ces variations avant
// comparaison pour ne pas dépendre d'une orthographe exacte d'en-tête.
function normalizeText_(value) {
  return cleanValue_(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function findHeader_(headers, expectedPrefix) {
  const header = findOptionalHeader_(headers, expectedPrefix);
  if (!header) {
    throw new Error(`Colonne requise introuvable : ${expectedPrefix}`);
  }
  return header;
}

function findOptionalHeader_(headers, expectedPrefix) {
  const normalizedPrefix = normalizeText_(expectedPrefix);
  return headers.find((candidate) =>
    normalizeText_(candidate).indexOf(normalizedPrefix) === 0
  ) || '';
}

// Lit un onglet et renvoie un objet par ligne, clé = en-tête (ligne headerRow).
// Les lignes entièrement vides sont ignorées.
function readSheetRecords_(spreadsheetId, sheetName, headerRow, maxRows) {
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`Onglet introuvable : ${sheetName}`);
  }

  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < headerRow) {
    return [];
  }

  const headers = values[headerRow - 1];
  const dataRows = values.slice(headerRow);
  const limitedRows = maxRows ? dataRows.slice(0, maxRows) : dataRows;

  return limitedRows
    .filter((row) => row.some((value) => cleanValue_(value)))
    .map((row) => headers.reduce((record, header, index) => {
      if (header) {
        record[header] = row[index];
      }
      return record;
    }, {}));
}
