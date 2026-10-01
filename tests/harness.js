// Banc d'essai : exécute le code Apps Script (.gs) dans Node, avec des
// classeurs simulés à la place de SpreadsheetApp, pour tester la chaîne
// lecture -> jointure -> bootstrap sans déployer.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

// spreadsheets : {id: {nomOnglet: valeurs 2D}} ; options.email, options.sheetsApi
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
      computeDigest: (algorithm, text) => [...require('crypto').createHash('sha256').update(text, 'utf8').digest()].map((b) => (b > 127 ? b - 256 : b))
    },
    PropertiesService: (() => {
      const store = {};
      const properties = {getProperty: (key) => (key in store ? store[key] : null), setProperty: (key, value) => { store[key] = String(value); return properties; }};
      return {getScriptProperties: () => properties};
    })(),
    HtmlService: {}
  };
  if (options.sheetsApi) context.Sheets = options.sheetsApi;
  vm.createContext(context);
  const files = fs.readdirSync(ROOT).filter((file) => file.endsWith('.gs')).sort();
  // Config.gs d'abord (constantes utilisées par les autres fichiers).
  files.sort((left, right) => (left === 'Config.gs' ? -1 : right === 'Config.gs' ? 1 : 0));
  vm.runInContext(files.map((file) => fs.readFileSync(path.join(ROOT, file), 'utf8')).join('\n;\n'), context, {filename: 'apps-script.js'});
  context.__logs = logs;
  context.__spreadsheets = opened;
  return context;
}

module.exports = {loadAppsScript, FakeSheet};
