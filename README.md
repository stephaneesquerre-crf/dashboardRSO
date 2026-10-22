# Dashboard RSO — Croix-Rouge française

Web app Google Apps Script qui suit l'avancement des actions de réduction
carbone (bilan carbone / RSO) par filière, territoire et pôle, à partir du
classeur « REPORTING NATIONAL », de ses archives mensuelles et du classeur
des référents environnement. Développée par Stéphane Esquerre, reprise par
Simon en octobre 2026.

## Par où commencer

- **Comprendre le projet en dix minutes** : `CLAUDE.md` (objet, fichiers,
  règles à respecter, vocabulaire). C'est aussi le fichier à donner en
  premier à un assistant IA.
- **Travailler avec un assistant IA** (Claude, ChatGPT, Gemini…) :
  `docs/prompt-demarrage.md` donne le message de départ à copier et la
  liste des fichiers à joindre selon la tâche.
- **Modifier et publier** : sections « Guide de reprise » et « Mettre à
  jour le dashboard » ci-dessous.
- **Détail des calculs et des vues** : dossier `docs/` (liste en fin de
  page). Journal des modifications : `HISTORIQUE.md`.

## Architecture

- **`Config.gs`** — constantes (ID du classeur, noms d'onglets, colonnes de
  la zone SYNTHESE, etc.).
- **`Utils.gs`** — lecture générique de feuilles (`readSheetTable_`,
  `readSheetTableInColumnRange_`) en tableaux, repérage des colonnes **par
  position** (`findColumnIndex_` : préfixe d'en-tête normalisé ; si
  plusieurs colonnes correspondent, la mieux remplie), ouverture des
  classeurs mémorisée (`openSpreadsheet_`), diagnostics renvoyés au
  navigateur (`addDiagnosticWarning_`), `cleanActionLabel_`.
- **`PoleReferenceService.gs`** — lit `BDD NOMS` (dimension pôle : filière,
  territoire, régions).
- **`IndicatorService.gs`** — lit `IMPORT DONNEES` (table de faits pôle ×
  action), reclasse PADOM en PA/DOM, joint faits et pôles, assemble
  `getDashboardBootstrap()`.
- **`BootstrapCacheService.gs`** — cache de 10 minutes des données
  calculées par `getDashboardBootstrap()` et contrôle des droits mémorisé
  par personne (voir `docs/fonctionnement-technique.md`).
- **`ToolLinksService.gs`** — lit l'onglet `Liens outils référents` (B:F : outil, outil bis, liste des référents ; arrêt à « Outils non utilisés » ; liens vers les
  outils de suivi par filière, saisis en chips intelligentes). Nécessite le
  **service avancé Sheets** (éditeur Apps Script → Services → Google
  Sheets API, identifiant `Sheets`) : les chips ne sont lisibles que par
  l'API Sheets (champ `chipRuns`), pas par `SpreadsheetApp`. Sans ce
  service, le dashboard se charge normalement, sans les liens.
- **`ActionReferenceService.gs`** — lit le référentiel `BDD - Actions
  supplémentaires` (poste d'émissions de chaque action).
- **`ArchiveImportService.gs`** — importe les archives mensuelles du
  `Tableau de bord VA` dans `HISTORIQUE TDB VA` (voir `docs/regles-de-calcul.md`).
- **`ProtEnfanceService.gs`** — lit l'onglet `PROT ENFANCE` (données de la
  protection de l'enfance, absentes d'`IMPORT DONNEES`).
- **`ReferentsService.gs`** — lit le classeur des référents (vue Référents).
- **`HistoryService.gs`** — lit `HISTORIQUE TDB VA` pour la vue Évolution.
- **`IdentityService.gs`** — restreint l'accès aux comptes `@croix-rouge.fr`
  (vérifié dans `doGet` et dans `getDashboardBootstrap`). Pas de couche de droits plus fine
  (filière par filière, etc.) : tout utilisateur du domaine voit tout.
- **`WebApp.gs`** — point d'entrée `doGet()`.
- **`Index.html`** — toute la logique métier côté client : filtres,
  agrégations, les 3 indicateurs, les graphiques SVG, les tableaux. Un seul
  aller-retour serveur au chargement (`getDashboardBootstrap()`), tout le
  reste se recalcule dans le navigateur à chaque changement de filtre —
  choix fait pour la rapidité, après qu'une version antérieure relisait le
  classeur à chaque interaction.

## Guide de reprise (08/10/2026)

### Faire une modification

1. Le code de référence est sur GitHub (`stephaneesquerre-crf/dashboardRSO`) ; la
   version en ligne est celle copiée dans le projet Apps Script. Les deux
   doivent rester identiques.
2. Un fichier modifié sur GitHub se recopie en entier dans le fichier de même
   nom de l'éditeur Apps Script ; ne jamais coller un fichier dans un autre
   (c'est ce qui avait fait disparaître `doGet`).
3. Ce qui varie (noms d'onglets, identifiants de classeurs, plages) se change
   dans `Config.gs`, pas dans le reste du code.
4. Les colonnes sont repérées par le début de leur intitulé : renommer un
   en-tête (ex. « Territoire » dans `BDD NOMS`) peut faire disparaître une
   donnée. L'encadré « points à vérifier » en tête du dashboard le signale.
5. Calculs, filtres et graphiques sont dans `Index.html` ; la lecture des
   classeurs est dans les fichiers `…Service.gs`.
6. Après chaque copie, exécuter `lancerTests` (`Tests.gs`) dans l'éditeur :
   tout doit être ✅.
7. En cas de doute sur un chiffre, `diagnosticDashboard()` liste les colonnes
   réellement lues et les avertissements.
8. Avant de publier, vérifier avec Déployer → Tester les déploiements (URL de
   test, qui affiche toujours le code en cours).
9. Publier sans changer l'adresse : Déployer → Gérer les déploiements →
   crayon → Version : « Nouvelle version » → Déployer. Ne jamais créer de
   nouveau déploiement (nouvelle adresse).
10. Revenir en arrière : même écran, choisir une version précédente ; décrire
    chaque changement dans `HISTORIQUE.md` et dans le document de `docs/`
    concerné.

### Mettre à jour les actions socles (ex. campagne 2027)

1. Les actions sont lues dans `IMPORT DONNEES`, zone SYNTHESE (colonnes
   AM:AZ, en-têtes en ligne 2) ; aucune liste d'actions n'est écrite dans le
   code.
2. Colonne « Action socles » : écrire « Action socle 2027 » (« Action socle »
   suivi de l'année). Cette valeur alimente la coche « Actions socles », la
   trajectoire et l'Évolution par campagne.
3. Colonne « Type d'action » : c'est la « Campagne » affichée dans la
   Synthèse et le Détail par pôle.
4. Ajouter chaque nouvelle action dans `BDD - Actions supplémentaires`
   (libellé, poste d'émissions, réduction) ; sinon le poste saisi par les
   pôles est gardé et les pôles pilotes ne sont pas recalculés.
5. Garder le même libellé partout (`IMPORT DONNEES`, référentiel, onglet
   `PROT ENFANCE`, Tableau de bord VA) ; seul le préfixe « Action socle - »
   est toléré.
6. Protection de l'enfance : ajouter les lignes dans le tableau retravaillé
   de l'onglet `PROT ENFANCE`, avec le même libellé, sans ligne vide au
   milieu des actions (la lecture s'arrête à la première ligne sans
   libellé) ; garder l'en-tête « SOMME » et la ligne des codes pôle du
   tableau brut.
7. Tableau de bord VA : la campagne apparaît en « Actions socles 2027 » dans
   la colonne des campagnes ; les archives mensuelles reprennent ce bloc tel
   quel.
8. Archive mensuelle : copier le tableau dans un nouvel onglet
   « Archives MM/AA » du classeur `Archives REPORTING NATIONAL` ; l'historique
   se met à jour dans l'heure (déclencheur horaire), ou tout de suite avec
   le bouton « Rafraîchir les archives » de la vue Évolution.
9. La nouvelle année apparaît seule dans la trajectoire ; l'objectif 2030 se
   règle dans `TRAJECTOIRE_REFERENCE` (`Index.html`).
10. Ensuite : recharger le dashboard, lire l'encadré « points à vérifier »,
    lancer `lancerTests`, et contrôler la campagne dans la Synthèse
    (Regrouper par Campagne).

## Mettre à jour le dashboard (copier-coller dans l'éditeur Apps Script)

Le projet Apps Script ne se relie pas nativement à GitHub (son « versioning »
ne concerne que les déploiements). Procédure, sans rien installer :

1. Pour chaque fichier modifié du dépôt, ouvrir le fichier **de même nom**
   dans l'éditeur Apps Script et remplacer **tout** son contenu (un fichier
   `.gs` = un fichier dans l'éditeur ; ne jamais coller un fichier dans un
   autre). Créer le fichier s'il n'existe pas encore.
2. Exécuter **`lancerTests`** (fichier `Tests.gs`) et lire le journal :
   tout doit être ✅. Un ❌ « Installation : WebApp.gs » signifie par exemple
   que `doGet` a disparu (cause de l'erreur « Fonction de script
   introuvable : doGet » au déploiement).
3. Déployer : Déployer → Gérer les déploiements → modifier → Nouvelle
   version.

Alternatives étudiées (01/10/2026) : `clasp` demande Node.js sur le poste ;
l'extension Chrome « Google Apps Script GitHub Assistant » (tierce, push/pull
depuis l'éditeur) ou un déploiement par GitHub Actions avec `clasp` (Node
tourne alors chez GitHub, mais il faut générer une fois des identifiants
`clasp` et les confier à GitHub) restent possibles si la politique de sécurité
de la Croix-Rouge les autorise.

## Tests

Trois niveaux :

- **`Tests.gs` → `lancerTests()`**, dans l'éditeur Apps Script : fichiers
  et fonctions présents, fonctions de calcul sur des données fabriquées,
  contrôles sur les **données réelles** (territoires de chaque filière,
  avertissements, mois de l'historique).
- **GitHub Actions** (`.github/workflows/tests.yml`) : à chaque envoi de
  code sur GitHub, la suite complète ci-dessous tourne sur les serveurs de
  GitHub (onglet « Actions » du dépôt, pastille verte/rouge par commit).
- **Suite complète** (`tests/`, ci-dessous), lançable aussi localement.

### Tests automatiques (`tests/`, non déployés dans Apps Script)

`npm install` puis `npm test` (avec `CHROMIUM_PATH` si le navigateur de
Playwright n'est pas installé à l'emplacement par défaut). Les tests
exécutent le **vrai code `.gs`** dans Node, avec des classeurs simulés
(`tests/harness.js`, `tests/fixtures.js`), puis l'interface `Index.html`
dans Chromium avec le bootstrap ainsi produit. Ils vérifient notamment :
territoires présents pour chaque filière (y compris avec une colonne
« Territoire » en double ou une colonne homonyme vide), zone SYNTHESE
seule lue, référentiel des actions, mois de l'historique, refus hors
domaine, import des archives, ordre des onglets, tri des barres. À lancer
avant chaque copie vers Apps Script.

## Fonctions à lancer depuis l'éditeur Apps Script

Choisir la fonction dans la liste en haut de l'éditeur, cliquer sur
« Exécuter », puis lire le journal d'exécution.

| Fonction | Fichier | À quoi elle sert |
|---|---|---|
| `lancerTests` | `Tests.gs` | Vérifier l'installation et les données réelles après chaque copie de code. |
| `diagnosticDashboard` | `IndicatorService.gs` | Avertissements, colonnes réellement lues, durée de chaque étape. |
| `testDashboardBootstrap` | `IndicatorService.gs` | Compter les lignes et les pôles chargés. |
| `diagnosticReductionCarbone` | `IndicatorService.gs` | Formats des colonnes de réduction carbone (%, kg) et pôles pilotes détectés. |
| `testActionReference` | `ActionReferenceService.gs` | Actions absentes du référentiel, postes modifiés. |
| `testBilanCarbone` | `BilanCarboneService.gs` | Poids lus et cibles calculées par filière. |
| `testToolLinks` | `ToolLinksService.gs` | Liens outils lus par filière. |
| `testListesReferents` | `ReferentsService.gs` | Sources des référent·es lues et pôles par filière. |
| `importArchivesTableauDeBord` | `ArchiveImportService.gs` | Réimporter toutes les archives dans `HISTORIQUE TDB VA`. |
| `actualiserHistoriqueSiModifie` | `ArchiveImportService.gs` | Même import, seulement si les archives ont changé (déclencheur horaire). |
| `diagnosticArchiveLayout` | `ArchiveImportService.gs` | Mise en page d'un onglet d'archive (à appeler avec son nom). |
| `viderCacheDashboard` | `BootstrapCacheService.gs` | Vider le cache des données (10 min). |
| `prechargerDashboard` | `BootstrapCacheService.gs` | Recharger le cache (déclencheur facultatif). |

## Limites connues

- **PROT ENFANCE** n'a aucune ligne dans la zone SYNTHESE d'IMPORT DONNEES ;
  ses données sont lues dans l'onglet `PROT ENFANCE` (voir plus haut).
- **OUTRE-MER** : le pôle correspondant dans BDD NOMS a un code vide, donc
  pas d'univers de pôles fiable pour cette filière (taux de réponse non
  calculable) — à corriger à la source dans BDD NOMS.
- Les données reflètent le classeur au moment du dernier chargement de la
  page : en cas de doute sur un chiffre, vérifier dans le Sheet vivant
  avant tout usage en réunion.
- Historique : `MAX_DASHBOARD_ROWS`/`MAX_REFERENCE_ROWS` plafonnaient
  silencieusement la lecture à 5000/1000 lignes ; la zone SYNTHESE en
  compte plus de 7900, ce qui tronquait les données au-delà (bug à
  l'origine de pôles PADOM jamais reclassés et de territoires CRC
  incomplets). Corrigé : la lecture va désormais jusqu'à la vraie dernière
  ligne de chaque feuille, sans plafond arbitraire.

## Documentation détaillée

- `docs/regles-de-calcul.md` : sources et jointure, colonnes lues, les
  trois indicateurs, PADOM, territoires, actions socles, poste
  d'émissions, cibles calculées, protection de l'enfance, historique du
  Tableau de bord VA.
- `docs/vues.md` : contenu et choix d'affichage de chaque onglet.
- `docs/fonctionnement-technique.md` : cache, droits d'accès, lectures
  groupées, points à vérifier et diagnostics.
- `docs/sujets-ouverts.md` : questions en suspens (actions non
  renseignées, réductions en kgCO2 et en %).
- `docs/prompt-demarrage.md` : démarrer une conversation avec un
  assistant IA.
- `HISTORIQUE.md` : journal des modifications.
