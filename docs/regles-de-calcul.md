# Règles de calcul et sources de données

Comment le dashboard lit les classeurs et calcule ses indicateurs. Sections reprises de l'ancien README.

## Sources et jointure

Deux onglets du classeur national :

- **`IMPORT DONNEES`**, zone **SYNTHESE**, colonnes **AM:AZ** uniquement — un
  couple pôle × action par ligne. Les colonnes AM:AZ sont imposées en dur
  (`Config.gs`) car les mêmes en-têtes (Site, Action envisagée...) se
  répètent ailleurs sur la feuille (plans d'action sites pilotes) ; chercher
  un en-tête sans restriction de colonnes trouverait la mauvaise zone.
  En-têtes en ligne 2 (ligne 1 = titre fusionné).
- **`BDD NOMS`** — dimension pôle (code, nom, filière, territoire, régions).
  Les colonnes territoire/régions sont figées à la main dans le Sheet, le
  code ne fait qu'un lookup dessus, jamais un recalcul.

La jointure se fait sur le code pôle (colonne `Site` d'IMPORT DONNEES ↔
colonne code de BDD NOMS), normalisé via `normalizeText_` (accents, casse,
apostrophes, espaces).

### Colonnes lues (zone SYNTHESE)

| Colonne source              | Champ interne | Lu par                  |
|------------------------------|---------------|--------------------------|
| Site                          | `poleCode`    | oui |
| Action envisagée               | `action`      | oui |
| Type d'action                  | `volet`       | oui |
| Poste d'émissions               | `thematique`  | oui, mais remplacé par le poste du référentiel `BDD - Actions supplémentaires` quand l'action y figure (voir ci-dessous) |
| Avancement                      | `avancement`  | oui |
| Filière                         | `filiere`     | oui (repli seulement si le pôle est introuvable dans BDD NOMS) |
| Action socles                   | `actionSocle` | oui (voir plus bas) |
| Objectif, Référent de l'action, Mise en place (texte), Outil, Noms | — | non |
| Réduction carbone à date / cible | `reductionADate` / `reductionCible` | oui, vue Par poste — pôles non pilotes seulement (voir « Sujet ouvert : CO2 en kg/% ») |

## Les 3 indicateurs (vue Synthèse)

- **Terminées / concernées** : couples pôle × action à 100 % ÷ couples
  « concernés » (tout sauf `Abandonnée` — un pôle à 0 % reste concerné).
  **Vérifié** directement contre une formule vivante du classeur national
  (ex. `SAN!J10/K10`).
- **Moyenne d'avancement** : moyenne des % d'avancement parmi les couples
  concernés. **Non vérifiée** contre une formule externe — l'onglet censé
  porter ce nom dans le classeur national s'est révélé être une copie mal
  étiquetée du premier indicateur. Interprétation raisonnable, pas une
  valeur confirmée.
- **Taux de réponse** : part des pôles connus (BDD NOMS) ayant au moins un
  avancement non nul, tous couples confondus. **Vérifié** contre les « % de
  réponses » déjà affichés dans le classeur national, filière par filière.
  Note : « a répondu » compte depuis toujours, pas seulement la campagne en
  cours — distinguer les deux reste une question ouverte.

## PADOM / PA / DOM

BDD NOMS regroupe les pôles personnes âgées et soin à domicile sous une
seule filière `PADOM`, mais IMPORT DONNEES et le classeur national les
distinguent en deux filières, `PA` et `DOM`. Le dashboard reclasse donc
chaque pôle PADOM vers PA ou DOM d'après ses propres lignes de faits
(`derivePadomOverrides_`), jamais d'après une règle recalculée. Vérifié :
chaque pôle PADOM (50 au total) n'apparaît jamais qu'avec l'une des deux
valeurs dans IMPORT DONNEES, jamais les deux — le reclassement est donc
sans ambiguïté.

## Territoires

Un territoire est une lettre ou un numéro (`Territoire A`, `Territoire 3`),
propre à chaque filière, associé à une liste de régions. Les deux
nomenclatures coexistent selon les filières, c'est normal.

## Colonne "Action socles" et coches de type d'action

La colonne AZ d'IMPORT DONNEES (`Action socles`) compte 9 valeurs réelles
observées (diagnostic du 24/09/2026) :

| Valeur | Nombre de lignes (environ) |
|---|---|
| `(vide)` | 2401 |
| `Action socle 2024` | 1899 |
| `Action socle 2025` | 1819 |
| `Action socle 2026` | 1658 |
| `Action spécifique filière` | 900 |
| `Action supplémentaire` | 274 |
| `Action filière` | 76 |
| `Action structurante` | 57 |
| `#N/A` | 4 |

Deux coches, partagées entre toutes les vues (un seul état,
`state.actionTypes` dans `Index.html`, fonctions `actionTypeOf` /
`passesActionTypeFilter`), décidées avec Simon le 29/09/2026 :

- **« Actions socle »** — lignes `Action socle <année>`, toutes années
  confondues. **Cochée par défaut.**
- **« Actions spécifiques filière »** — lignes `Action filière` et
  `Action spécifique filière`.

Les deux sont cumulables. Aucune cochée = aucun filtre : toutes les
lignes, y compris `Action structurante`, `Action supplémentaire` et les
lignes non classées (qui ne ressortent que dans ce cas).

Le Top 3 / Bottom 3 de la vue Synthèse a été retiré le 29/09/2026 (demande
de Simon).

## Poste d'émissions (thématique) d'une action

Une même action est parfois rattachée à des postes différents selon les
fichiers des pôles (constat de Simon, 29/09/2026). Le poste affiché vient
donc du référentiel **`BDD - Actions supplémentaires`** du classeur
national (`ActionReferenceService.gs`) : colonne « Action… » et colonne
« Poste… » / « Catégorie… » / « Thématique… », la ligne d'en-tête étant
cherchée dans les 10 premières lignes. Une action absente du référentiel
garde le poste saisi par le pôle. `testActionReference()` (à lancer
depuis l'éditeur) liste les actions absentes et les postes modifiés.

## Cibles calculées (20/10/2026)

- **Cibles calculées** (`BilanCarboneService.gs`) : pour une ligne sans
  « Réduction carbone cible » (cas de PROT ENFANCE et PET E), cible =
  réduction de l'action au catalogue (`BDD - Actions supplémentaires`, en
  points de % du bilan CRF) × poids du poste dans la ligne « Moyenne
  filière … » de `BDD - Bilan carbone` ÷ poids du poste dans le bilan CRF
  (ligne « Bilan CRF » du tableau : immobilisations = 2e poste, 21 %,
  confirmé le 20/10/2026 ; le bloc de droite M14:M21, utilisé par la
  formule L22 des fichiers des pôles, inverse achats de biens et
  immobilisations et doit être corrigé). À date = cible × avancement (ou
  cible si terminé, selon l'indicateur). Une cible saisie non nulle n'est
  jamais remplacée ; une cible vide ou à 0 l'est. Les pôles pilotes
  utilisent aussi cette cible ajustée à leur filière (décision du
  20/10/2026). Lignes « Moyenne filière » : moyennes pondérées par les
  effectifs des types d'établissement. Le type
  d'établissement des pôles n'étant renseigné nulle part, c'est toujours la
  moyenne de la filière. Correspondances : Compétence → CRC, Handicap →
  PSH, PADOM → PA et DOM, Petite Enfance → PET E, Protection de
  l'enfance → PROT ENFANCE, Sanitaire → SAN (Bénévoles : aucune filière).
  Si la ligne « Bilan CRF » du tableau et le bloc de droite diffèrent,
  l'écart est signalé. `testBilanCarbone()` affiche les poids lus et le
  nombre de cibles calculées par filière.

## Protection de l'enfance (onglet `PROT ENFANCE`, 08/10/2026)

Les avancements de la protection de l'enfance sont produits dans un autre
outil et n'arrivent pas dans `IMPORT DONNEES`. `ProtEnfanceService.gs` lit
l'onglet `PROT ENFANCE` du classeur national :

- **tableau retravaillé** = la ligne d'en-tête qui contient « SOMME » ;
  colonnes pôle = celles situées avant « SOMME » ; une ligne par action
  (libellés standard) jusqu'à la première ligne sans libellé ;
- **codes pôle** = la ligne, au-dessus, dont le plus de cellules sont des
  codes de `BDD NOMS` (ligne 2 du tableau brut, ex. « Territoire A :
  IDF_4507 ») ; les colonnes des deux tableaux sont alignées ;
- valeurs : 0,4 → « 40% », « Abandonnée » gardé, vide ignoré ;
- campagne (Action socle 2024…) reprise des autres filières pour le même
  libellé d'action ; pas de réduction carbone (absente de l'onglet) ;
- un pôle déjà présent dans `IMPORT DONNEES` n'est pas repris d'ici (pas de
  double compte le jour où ces données y arriveront).

Rien n'est repéré par numéro de ligne : l'ajout des actions socles 2027
décale les tableaux sans casser la lecture (testé). Vérifié sur l'onglet
réel (copie du 08/10/2026) : 22 actions, 17 pôles, 357 valeurs ; « SPFS
Besançon » (ligne des codes) n'est pas un code de `BDD NOMS` et apparaît
sans territoire (signalé dans « points à vérifier »).

## Historique du Tableau de bord VA (base de la future vue Évolution)

Le `Tableau de bord VA` est archivé à la main chaque mois dans un onglet
`Archives MM/AA` (ex. `Archives 11/25`, `Archives 09.26`, `Archives 1125` ;
un suffixe comme `Archives 01/26 2` est toléré, le mois en double est
signalé).
`importArchivesTableauDeBord()` (`ArchiveImportService.gs`, à lancer depuis
l'éditeur après chaque nouvelle archive) relit tous ces onglets et les
réécrit dans l'onglet **`HISTORIQUE TDB VA` du classeur des archives**
(`ARCHIVES_SPREADSHEET_ID` dans `Config.gs` ; vide = classeur national),
au format long : une ligne
= Mois, Onglet source, Campagne, Action, Filière (libellé source),
Filière (nom du dashboard), Indicateur, Valeur, Importé le.

- Indicateurs : `tauxTerminees`, `terminees`, `concernes` (par action et
  filière, plus TOTAL), `nbStructures`, `nbRepondants`, `tauxReponse` (par
  filière).
- Repérage par le contenu (titre « TX DE TERMINES PARMIS LES
  CONCERNES », colonne TOTAL), pas par numéros de ligne : la mise en page
  varie d'une archive à l'autre. Seul le premier bloc de chaque onglet est
  lu (certains en contiennent une copie plus bas). Cellules en erreur
  (`#REF!`, `#DIV/0!`) ignorées.
- Réimporter un onglet remplace ses lignes (pas de doublon).
- **Actualisation automatique** (02/10/2026) : `actualiserHistoriqueSiModifie`
  relit les onglets « Archives… », calcule l'empreinte de leur contenu et ne
  réécrit l'historique que si elle a changé (nouveau mois, valeur corrigée,
  onglet supprimé). À brancher **une seule fois** sur un déclencheur :
  éditeur Apps Script → Déclencheurs (icône réveil) → Ajouter un
  déclencheur → fonction `actualiserHistoriqueSiModifie`, source
  « Déclenché par le temps », « Minuteur horaire », « Toutes les heures ».
  Ensuite plus aucune intervention ; `importArchivesTableauDeBord()` reste
  disponible pour forcer une actualisation.
- **Bouton « Rafraîchir les archives »** (12/10/2026, vue Évolution) : même
  import forcé, lancé depuis le dashboard (`rafraichirArchivesDepuisDashboard`,
  réservé au domaine, verrou `LockService` contre deux actualisations
  simultanées). Affiche le compte rendu par onglet et réaffiche la vue sans
  recharger la page. L'écriture dans `HISTORIQUE TDB VA` se fait avec le
  compte choisi dans « Exécuter en tant que » du déploiement : si c'est
  « Utilisateur accédant à l'application », seules les personnes pouvant
  modifier le classeur des archives peuvent rafraîchir (sinon message
  d'erreur dans la vue). La vue Évolution affiche la
  date de la dernière actualisation. (Empreinte plutôt que date de
  modification du fichier : la date n'est lisible que via DriveApp, qui
  imposerait une autorisation Google Drive à tous les utilisateurs.)
- Filières : `PETITE ENFANCE` / `PET E` / `PET. ENF.` → `PET E`,
  `SANITAIRE` → `SAN`, `PROTECTION DE L'ENFANCE` / `PROT. ENF.` →
  `PROT ENFANCE`. `PADOM` n'est pas séparé en PA / DOM dans les archives.
  `DNOM` gardé tel quel (aucune valeur à ce jour).
- Vérifié sur l'export des 8 archives (11/2025 à 09/2026) : ex.
  09/2026, Repas végétariens : TOTAL 67,9 %, SAN 11 / 14, PSH 33 / 38.
- Non lu : le bloc « % de réponses » par année en bas de l'onglet.
- Archives antérieures à 11/2025 (`09/25`, `10/25`) : autre mise en page,
  bloc « Tableau de la moyenne des avancements » (`parseLegacyArchiveValues_`,
  relevée avec `diagnosticArchiveLayout`). On y lit, pour l'ensemble
  seulement, la moyenne d'avancement, les terminés, les concernés et le
  taux de terminés ; par filière, seulement le nombre de terminés (pas de
  taux). Les indicateurs DIP (« (objectif …) ») sont ignorés.
- Mois en double (ex. `Archives 01/26` et `Archives 01/26 2`) : signalés à
  l'import ; la vue Évolution ne garde que l'onglet au nom le plus court.
- Classeur des archives : `Archives REPORTING NATIONAL`
  (`ARCHIVES_SPREADSHEET_ID`). Les utilisateurs du dashboard doivent
  pouvoir le lire, sinon la vue Évolution reste vide (sans bloquer le
  reste).
