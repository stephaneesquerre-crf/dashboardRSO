// Banc d'essai : exécute le code Apps Script (.gs) dans Node, avec des
// classeurs simulés à la place de SpreadsheetApp, pour tester la chaîne
// lecture -> jointure -> bootstrap sans déployer.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');

function columnToIndex(letters) {
  return letters.split('').reduce((acc, ch) => acc * 26 + ch.charCodeAt(0) - 64, 0) - 1;
}

class FakeRange {
  constructor(sheet, row, col, numRows, numCols) {
    Object.assign(this, {sheet, row, col, numRows, numCols});
  }
  getValues() {
    const out = [];
    for (let r = 0; r < this.numRows; r += 1) {
      const source = this.sheet.values[this.row + r] || [];
      const line = [];
      for (let c = 0; c < this.numCols; c += 1) {
        const value = source[this.col + c];
        line.push(value === undefined || value === null ? '' : value);
      }
      out.push(line);
    }
    return out;
  }
  getDisplayValues() {
    return this.getValues().map((line) => line.map((value) => (value instanceof Date ? value.toString() : String(value))));
  }
  setValues(values) {
    values.forEach((line, r) => {
      this.sheet.values[this.row + r] = this.sheet.values[this.row + r] || [];
      line.forEach((value, c) => { this.sheet.values[this.row + r][this.col + c] = value; });
    });
    return this;
  }
  setNumberFormat() { return this; }
}

class FakeSheet {
  constructor(name, values) {
    this.name = name;
    this.values = values.map((line) => line.slice());
  }
  getName() { return this.name; }
  getLastRow() {
    for (let r = this.values.length - 1; r >= 0; r -= 1) {
      if ((this.values[r] || []).some((v) => v !== '' && v !== null && v !== undefined)) return r + 1;
    }
    return 0;
  }
  getLastColumn() { return Math.max(0, ...this.values.map((line) => line.length)); }
  getDataRange() { return new FakeRange(this, 0, 0, this.getLastRow(), this.getLastColumn()); }
  getRange(a, b, c, d) {
    if (typeof a === 'number') return new FakeRange(this, a - 1, b - 1, c || 1, d || 1);
    const match = String(a).match(/^([A-Z]+)(\d*):([A-Z]+)(\d*)$/);
    if (!match) throw new Error(`A1 non géré : ${a}`);
    const firstRow = match[2] ? Number(match[2]) - 1 : 0;
    const lastRow = match[4] ? Number(match[4]) - 1 : Math.max(0, this.getLastRow() - 1);
    const firstCol = columnToIndex(match[1]);
    const lastCol = columnToIndex(match[3]);
    return new FakeRange(this, firstRow, firstCol, lastRow - firstRow + 1, lastCol - firstCol + 1);
  }
  clearContents() { this.values = []; return this; }
}

class FakeSpreadsheet {
  constructor(id, sheets) {
    this.id = id;
    this.sheets = Object.entries(sheets).map(([name, values]) => new FakeSheet(name, values));
  }
  getId() { return this.id; }
  getSheetByName(name) { return this.sheets.find((sheet) => sheet.name === name) || null; }
  getSheets() { return this.sheets; }
  insertSheet(name) { const sheet = new FakeSheet(name, []); this.sheets.push(sheet); return sheet; }
}

// Sheets.Spreadsheets.Values.batchGet simulé sur les classeurs simulés :
// valeurs affichées, cellules vides de fin de ligne et lignes vides de fin
// omises comme le fait l'API ; onglet inconnu -> erreur (comme l'API).
function fakeValuesApi(opened, calls) {
  return {
    batchGet(spreadsheetId, params) {
      calls.push({spreadsheetId, ranges: params.ranges.slice()});
      const spreadsheet = opened[spreadsheetId];
      if (!spreadsheet) throw new Error(`Classeur inaccessible : ${spreadsheetId}`);
      return {valueRanges: params.ranges.map((range) => {
        const match = range.match(/^'((?:[^']|'')+)'(?:!(.+))?$/);
        const sheet = spreadsheet.getSheetByName(match[1].replace(/''/g, "'"));
        if (!sheet) throw new Error(`Unable to parse range: ${range}`);
        const values = (match[2] ? sheet.getRange(match[2]) : sheet.getDataRange()).getDisplayValues()
          .map((row) => { const copy = row.slice(); while (copy.length && copy[copy.length - 1] === '') copy.pop(); return copy; });
        while (values.length && values[values.length - 1].length === 0) values.pop();
        return {range, values};
      })};
    }
  };
}

function fakeBlob(buffer) {
  return {buffer, getBytes: () => [...buffer], getDataAsString: () => buffer.toString('utf8')};
}

// Cache Apps Script simulé (sans expiration) ; valeur limitée à 100 Ko
// comme le vrai. log : tableau recevant les clés écrites (facultatif).
function fakeCache(log) {
  const store = {};
  const put = (key, value) => {
    if (String(value).length > 100 * 1024) throw new Error(`Valeur trop grande pour le cache : ${key}`);
    store[key] = String(value);
    if (log) log.push(key);
  };
  return {
    get: (key) => (key in store ? store[key] : null),
    getAll: (keys) => Object.fromEntries(keys.filter((key) => key in store).map((key) => [key, store[key]])),
    put,
    putAll: (entries) => Object.entries(entries).forEach(([key, value]) => put(key, value)),
    remove: (key) => { delete store[key]; }
  };
}

// spreadsheets : {id: {nomOnglet: valeurs 2D}} ; options.email, options.sheetsApi,
// options.batchGet (true : service avancé avec Values.batchGet simulé)
function loadAppsScript(spreadsheets, options = {}) {
  const opened = Object.fromEntries(Object.entries(spreadsheets).map(([id, sheets]) => [id, new FakeSpreadsheet(id, sheets)]));
  const logs = [];
  const context = {
    console: {log() {}, warn() {}, error() {}},
    Logger: {log: (message) => logs.push(String(message))},
    SpreadsheetApp: {
      openById(id) {
        if (!opened[id]) throw new Error(`Classeur inaccessible : ${id}`);
        return opened[id];
      }
    },
    Session: {
      getActiveUser: () => ({getEmail: () => options.email || 'test@croix-rouge.fr'}),
      getScriptTimeZone: () => 'Europe/Paris'
    },
    Utilities: {
      formatDate: (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      DigestAlgorithm: {SHA_256: 'sha256'},
      Charset: {UTF_8: 'utf8'},
      computeDigest: (algorithm, text) => [...require('crypto').createHash('sha256').update(text, 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b)),
      newBlob: (data) => fakeBlob(typeof data === 'string' ? Buffer.from(data, 'utf8') : Buffer.from(data)),
      gzip: (blob) => fakeBlob(zlib.gzipSync(blob.buffer)),
      ungzip: (blob) => fakeBlob(zlib.gunzipSync(blob.buffer)),
      base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
      base64Decode: (text) => [...Buffer.from(text, 'base64')]
    },
    CacheService: (() => {
      const scriptCache = fakeCache(options.cacheLog);
      const userCache = fakeCache();
      return {getScriptCache: () => scriptCache, getUserCache: () => userCache};
    })(),
    PropertiesService: (() => {
      const store = {};
      const properties = {getProperty: (key) => (key in store ? store[key] : null), setProperty: (key, value) => { store[key] = String(value); return properties; }};
      return {getScriptProperties: () => properties};
    })(),
    LockService: {getScriptLock: () => ({tryLock: () => true, releaseLock() {}})},
    HtmlService: {}
  };
  const batchCalls = [];
  if (options.sheetsApi || options.batchGet) {
    context.Sheets = Object.assign({}, options.sheetsApi || {});
    context.Sheets.Spreadsheets = Object.assign({}, (options.sheetsApi && options.sheetsApi.Spreadsheets) || {});
    // Test d'accès léger (checkSpreadsheetAccess_) : refusé si le classeur
    // n'est pas fourni, comme SpreadsheetApp.openById.
    const get = context.Sheets.Spreadsheets.get;
    context.Sheets.Spreadsheets.get = (id, params) => {
      if (params && params.fields === 'spreadsheetId') {
        if (!opened[id]) throw new Error(`Classeur inaccessible : ${id}`);
        return {spreadsheetId: id};
      }
      return get(id, params);
    };
    if (options.batchGet) context.Sheets.Spreadsheets.Values = fakeValuesApi(opened, batchCalls);
  }
  vm.createContext(context);
  const files = fs.readdirSync(ROOT).filter((file) => file.endsWith('.gs')).sort();
  // Config.gs d'abord (constantes utilisées par les autres fichiers).
  files.sort((left, right) => (left === 'Config.gs' ? -1 : right === 'Config.gs' ? 1 : 0));
  vm.runInContext(files.map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n;\n'), context, {filename: 'apps-script.js'});
  context.__logs = logs;
  context.__batchCalls = batchCalls;
  context.__spreadsheets = opened;
  return context;
}

module.exports = {loadAppsScript, FakeSheet};
