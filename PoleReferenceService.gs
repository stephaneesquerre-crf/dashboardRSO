// Lit BDD NOMS : une ligne = un pôle. Sert à connaître l'univers des pôles
// attendus par filière (nécessaire pour la ligne de qualité), et plus tard
// pour l'axe territoire. Les colonnes territoire/régions sont ajoutées et
// figées à la main dans le Sheet (voir CLAUDE.md) : le code se contente d'un
// lookup, jamais d'un recalcul des regex d'extraction.
function getPoleReference_() {
  const config = getConfig_();
  const records = readSheetRecords_(
    config.SPREADSHEET_ID,
    config.POLE_REFERENCE_SHEET_NAME,
    config.HEADER_ROW
  );

  if (records.length === 0) {
    return {};
  }

  const columns = findPoleReferenceColumns_(Object.keys(records[0]));

  return records.reduce((byPoleCode, record) => {
    const poleCode = cleanValue_(record[columns.poleCode]);
    if (!poleCode) {
      return byPoleCode;
    }

    byPoleCode[normalizeText_(poleCode)] = {
      poleCode,
      label: cleanValue_(record[columns.label]),
      filiere: cleanValue_(record[columns.filiere]),
      territoire: columns.territoire ? cleanValue_(record[columns.territoire]) : '',
      regions: columns.regions ? cleanValue_(record[columns.regions]) : ''
    };
    return byPoleCode;
  }, {});
}

function findPoleReferenceColumns_(headers) {
  return {
    poleCode: findHeader_(headers, 'code'),
    label: findHeader_(headers, 'nom'),
    filiere: findHeader_(headers, 'filiere'),
    territoire: findOptionalHeader_(headers, 'territoire'),
    regions: findOptionalHeader_(headers, 'region')
  };
}
