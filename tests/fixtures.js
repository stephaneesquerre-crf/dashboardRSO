// Classeurs simulés, structurés comme les vrais (cf. README.md).
const NATIONAL_ID = '1JLtSywWoSeeI_lA1O0YA-C_SKFdSwIaCQm_xLWl43c0';
const ARCHIVES_ID = '1iUIbQYPfBAYJDTqqg2oO75zMHcbJoIEBbtqQ_IyvM5k';

const SYNTHESE_HEADERS = ['Site', 'Action envisagée', "Type d'action", "Poste d'émissions", 'Objectif', 'Avancement',
  "Référent de l'action", "Mise en place de l'action (texte)", 'Réduction carbone à date', 'Réduction carbone cible',
  'Filière', 'Outil', 'Noms', 'Action socles'];

const FILIERES = {
  CRC: ['Territoire A', 'Territoire B'],
  SAN: ['Territoire 1', 'Territoire 2', 'Territoire 3'],
  PSH: ['Territoire A', 'Territoire C']
};

function buildPoles() {
  const poles = [];
  Object.entries(FILIERES).forEach(([filiere, territoires]) => {
    territoires.forEach((territoire, t) => {
      for (let k = 0; k < 2; k += 1) {
        poles.push({code: `${filiere}_${t}${k}`, nom: `Pôle ${filiere} ${t}${k}`, filiere, territoire, regions: `Régions ${t}`});
      }
    });
  });
  return poles;
}

// variant : 'normal' | 'territoireEnDouble' (colonne homonyme vide après la
// bonne) | 'territoireVideAvant' (colonne vide « Territoire (ancien) » avant)
// | 'sansTerritoire'
function buildBddNoms(variant = 'normal') {
  const poles = buildPoles();
  let headers = ['Code pôle', 'Nom du pôle', 'Filière', 'Territoire', 'Régions'];
  let rows = poles.map((p) => [p.code, p.nom, p.filiere, p.territoire, p.regions]);
  if (variant === 'territoireEnDouble') {
    headers = headers.concat(['Territoire']);
    rows = rows.map((row) => row.concat(['']));
  }
  if (variant === 'territoireVideAvant') {
    headers = ['Code pôle', 'Nom du pôle', 'Filière', 'Territoire (ancien)', 'Territoire', 'Régions'];
    rows = poles.map((p) => [p.code, p.nom, p.filiere, '', p.territoire, p.regions]);
  }
  if (variant === 'sansTerritoire') {
    headers = ['Code pôle', 'Nom du pôle', 'Filière', 'Régions'];
    rows = poles.map((p) => [p.code, p.nom, p.filiere, p.regions]);
  }
  return [headers].concat(rows);
}

function buildImportDonnees() {
  const poles = buildPoles();
  const width = 52; // jusqu'à AZ
  const amIndex = 38; // AM
  const title = Array(width).fill('');
  title[amIndex] = 'SYNTHESE';
  const header = Array(width).fill('');
  // En-têtes homonymes hors zone (plans d'actions sites pilotes) : ne
  // doivent pas être lus.
  header[0] = 'Site';
  header[1] = 'Action envisagée';
  SYNTHESE_HEADERS.forEach((label, i) => { header[amIndex + i] = label; });
  const actions = [
    ['Repas végétariens', 'Achats de biens', 'Action socle 2024'],
    ['Action socle - Ecoconduite', 'Transport', 'Action socle 2024'],
    ['Bornes électriques', 'Transport', 'Action socle 2025'],
    ['Action filière X', 'Énergie', 'Action filière']
  ];
  const rows = [];
  poles.forEach((pole, p) => {
    actions.forEach(([action, poste, socle], a) => {
      const line = Array(width).fill('');
      line[0] = 'NE PAS LIRE';
      const avancement = ['0%', '50%', '100%', 'Abandonnée'][(p + a) % 4];
      const values = [pole.code, action, '2024', poste, '', avancement, '', '', '-0,10%', '-0,20%', pole.filiere, '', '', socle];
      values.forEach((value, i) => { line[amIndex + i] = value; });
      rows.push(line);
    });
  });
  return [title, header].concat(rows);
}

function buildNational(variant) {
  return {
    'IMPORT DONNEES': buildImportDonnees(),
    'BDD NOMS': buildBddNoms(variant),
    'BDD - Actions supplémentaires': [
      ['Catalogue des actions'],
      ['Actions', 'Poste émissions', 'Réduction'],
      ['Repas végétariens', 'Achats de biens', '-2,07%'],
      ['Ecoconduite', 'Transport', '-0,18%'],
      ['Bornes électriques', 'Transport', '-1,61%']
    ]
  };
}

function buildArchives() {
  return {
    'HISTORIQUE TDB VA': [
      ['Mois', 'Onglet source', 'Campagne', 'Action', 'Filière (libellé source)', 'Filière', 'Indicateur', 'Valeur', 'Importé le'],
      // Mois relu comme une date (conversion automatique de Google Sheets).
      [new Date(2026, 8, 1), 'Archives 09.26', 'Actions socles 2024', 'Repas végétariens', 'TOTAL', 'TOTAL', 'tauxTerminees', 0.68, ''],
      ['2026-08', 'Archives 08/26', 'Actions socles 2024', 'Repas végétariens', 'TOTAL', 'TOTAL', 'tauxTerminees', 0.63, '']
    ]
  };
}

module.exports = {NATIONAL_ID, ARCHIVES_ID, FILIERES, buildNational, buildArchives, buildPoles};
