# Contexte du projet Dashboard RSO

À lire en premier, par une personne ou par un assistant IA, avant toute
modification. Le détail est dans `README.md` et dans le dossier `docs/`.

## Objet

Web app Google Apps Script de la Croix-Rouge française. Elle suit
l'avancement des actions de réduction carbone (bilan carbone / RSO) des
pôles, par filière et par territoire. Utilisateurs : comptes
`@croix-rouge.fr` uniquement.

Sources, toutes en Google Sheets (identifiants dans `Config.gs`) :
- classeur « REPORTING NATIONAL » : `IMPORT DONNEES` (zone SYNTHESE,
  colonnes AM:AZ, une ligne par couple pôle × action, environ 7 000 à
  8 000 lignes), `BDD NOMS` (pôles), `BDD - Actions supplémentaires`
  (référentiel des actions), `BDD - Bilan carbone`, `PROT ENFANCE`,
  `Liens outils référents` ;
- classeur « Archives REPORTING NATIONAL » : archives mensuelles du
  Tableau de bord VA et onglet `HISTORIQUE TDB VA` (vue Évolution) ;
- classeur « Synthèse référents Environnement » (vue Référents).

## Contraintes techniques

- Apps Script (moteur V8), sans outil de compilation ni dépendance. Le
  code en ligne est copié à la main depuis GitHub dans l'éditeur Apps
  Script, fichier par fichier (procédure dans `README.md`).
- Déploiement « exécuté par l'utilisateur » : chaque personne lit les
  classeurs avec ses propres droits.
- Service avancé « Google Sheets API » (identifiant `Sheets`) activé :
  liens en chips intelligentes, lectures groupées, contrôle d'accès léger.
- `Index.html` est un fichier unique d'environ 265 Ko (style, page et
  JavaScript). Il contient toute la logique de calcul et d'affichage.

## Fichiers

| Fichier | Rôle |
|---|---|
| `Config.gs` | Identifiants des classeurs, noms d'onglets, plages. Tout ce qui varie se change ici. |
| `Utils.gs` | Lecture des feuilles, repérage des colonnes, lectures groupées, diagnostics, durées. |
| `IndicatorService.gs` | Point d'entrée `getDashboardBootstrap()` : lit et joint les données, contrôle les accès. |
| `BootstrapCacheService.gs` | Cache de 10 minutes des données et des droits. |
| `PoleReferenceService.gs` | `BDD NOMS` (filière, territoire, régions de chaque pôle). |
| `ActionReferenceService.gs` | Référentiel des actions (poste d'émissions, réduction). |
| `BilanCarboneService.gs` | Cibles calculées pour les lignes sans cible. |
| `ProtEnfanceService.gs` | Onglet `PROT ENFANCE`. |
| `ToolLinksService.gs` | Liens vers les outils de suivi et les listes de référent·es. |
| `ReferentsService.gs` | Classeur des référent·es. |
| `HistoryService.gs` / `ArchiveImportService.gs` | Historique mensuel (vue Évolution) et import des archives. |
| `IdentityService.gs` / `WebApp.gs` | Restriction au domaine, `doGet()`. |
| `Tests.gs` | `lancerTests()`, à exécuter dans l'éditeur après chaque copie. |
| `Index.html` | Calculs, filtres, graphiques, tableaux, exports. |
| `tests/` | Tests automatiques (Node + Chromium), lancés par GitHub Actions. |

Repères dans `Index.html` (rechercher le nom) : `computeSnapshot`
(indicateurs de la Synthèse), `computeActionDetail` (tableau « Détail des
données »), `computeMatrix` / `renderMatrix` (Détail par pôle),
`computeControlRows` (Contrôle), `renderPoste` / `computeTrajectoire`
(Détail par poste), `historyRows` / `renderEvolution` (Évolution),
`referentPoles` / `renderReferents` (Référents), `applyBootstrap`
(affichage après chargement). Chaque vue commence par un commentaire
`// Vue …`.

## Règles à respecter

1. **Une seule version de chaque formule**, dans `Index.html`. Le
   serveur lit et joint les données ; il ne calcule pas les indicateurs.
2. **Colonnes repérées par le début de leur en-tête**
   (`findColumnIndex_`), jamais par leur lettre, sauf la zone AM:AZ
   d'`IMPORT DONNEES` fixée dans `Config.gs`. Renommer un en-tête dans un
   classeur peut faire disparaître une donnée.
3. **Rien de codé en dur** qui vit dans un classeur : listes d'actions,
   de filières, de territoires. Les filtres se remplissent à partir des
   données.
4. **Ne jamais bloquer le chargement** pour une source secondaire :
   signaler le problème avec `addDiagnosticWarning_` (encadré « points à
   vérifier » de la page) et continuer.
5. **Valeur inconnue = absente, jamais 0** (vue Évolution).
6. **Ne pas additionner** des réductions en kgCO2 et en % (sujet ouvert,
   `docs/sujets-ouverts.md`).
7. **PADOM** est reclassé en PA ou DOM d'après les lignes du pôle dans
   `IMPORT DONNEES`, jamais par une règle recalculée.
8. Si la forme des données envoyées à la page change, changer
   `BOOTSTRAP_CACHE_KEY_` (`BootstrapCacheService.gs`).
9. Commentaires en français qui expliquent le pourquoi, avec la date
   d'une décision ou d'un constat. Chaque modification met à jour le
   document de `docs/` concerné et `HISTORIQUE.md`.
10. Avant de livrer : `npm test` (tests automatiques), puis
    `lancerTests` dans l'éditeur après la copie.

## Vocabulaire

- **Pôle** : établissement ou groupe d'établissements, identifié par un
  code (`BDD NOMS`), ex. `Territoire A : IDF_4507`.
- **Filière** : CRC, SAN, PSH, PA, DOM, PET E, PROT ENFANCE…
- **Territoire** : lettre ou numéro propre à chaque filière, avec ses
  régions (« Territoire A · HDF - IDF - GE »).
- **Action socle** : action commune à toutes les filières, par campagne
  annuelle (« Action socle 2024 », colonne « Action socles »).
- **Campagne** : colonne « Type d'action » d'`IMPORT DONNEES`, appelée
  `volet` dans le code.
- **Concernée** : couple pôle × action qui n'est pas « Abandonnée ».
  **Terminée** : avancement à 100 %.
- **Pôle pilote** : pôle du bilan carbone 2023 dont certaines réductions
  sont en kgCO2.
