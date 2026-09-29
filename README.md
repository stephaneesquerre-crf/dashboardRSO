# Dashboard RSO — Croix-Rouge française

Web app Google Apps Script qui suit l'avancement des actions de réduction
carbone (bilan carbone / RSO) par filière, territoire et pôle, à partir de
deux onglets du classeur national. Ce document remplace un `CLAUDE.md` qui
était cité un peu partout dans le code mais n'a jamais été committé — pensé
pour qu'une personne qui reprend le projet après le départ de son auteur
initial (Simon) puisse comprendre les choix faits sans avoir à les
redécouvrir un par un.

## Architecture

- **`Config.gs`** — constantes (ID du classeur, noms d'onglets, colonnes de
  la zone SYNTHESE, etc.).
- **`Utils.gs`** — lecture générique de feuilles (`readSheetRecords_`,
  `readSheetRecordsInColumnRange_`), normalisation de texte/en-têtes
  (`normalizeText_`, `findHeader_`).
- **`PoleReferenceService.gs`** — lit `BDD NOMS` (dimension pôle : filière,
  territoire, régions).
- **`IndicatorService.gs`** — lit `IMPORT DONNEES` (table de faits pôle ×
  action), reclasse PADOM en PA/DOM, joint faits et pôles, assemble
  `getDashboardBootstrap()`.
- **`ToolLinksService.gs`** — lit l'onglet `Liens outils` (liens vers les
  outils de suivi par filière, saisis en chips intelligentes). Nécessite le
  **service avancé Sheets** (éditeur Apps Script → Services → Google
  Sheets API, identifiant `Sheets`) : les chips ne sont lisibles que par
  l'API Sheets (champ `chipRuns`), pas par `SpreadsheetApp`. Sans ce
  service, le dashboard se charge normalement, sans les liens.
- **`ActionReferenceService.gs`** — lit le référentiel `BDD - Actions
  supplémentaires` (poste d'émissions de chaque action).
- **`ArchiveImportService.gs`** — importe les archives mensuelles du
  `Tableau de bord VA` dans `HISTORIQUE TDB VA` (voir plus bas).
- **`HistoryService.gs`** — lit `HISTORIQUE TDB VA` pour la vue Évolution.
- **`IdentityService.gs`** — restreint l'accès aux comptes `@croix-rouge.fr`
  et journalise les connexions/incidents. Pas de couche de droits plus fine
  (filière par filière, etc.) : tout utilisateur du domaine voit tout.
- **`WebApp.gs`** — point d'entrée `doGet()`.
- **`Index.html`** — toute la logique métier côté client : filtres,
  agrégations, les 3 indicateurs, les graphiques SVG, les tableaux. Un seul
  aller-retour serveur au chargement (`getDashboardBootstrap()`), tout le
  reste se recalcule dans le navigateur à chaque changement de filtre —
  choix fait pour la rapidité, après qu'une version antérieure relisait le
  classeur à chaque interaction.

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

## Mise en page de la vue Synthèse

Graphique principal, graphique de comparaison et fiche d'identité sur une
même ligne (sous 1200px de large, le graphique principal passe seul sur sa
ligne). Au-delà de 10 groupes (`HORIZONTAL_BAR_THRESHOLD`), les graphiques
passent en barres horizontales pour que les libellés restent lisibles
(ex. regroupement par action).

## Poste d'émissions (thématique) d'une action

Une même action est parfois rattachée à des postes différents selon les
fichiers des pôles (constat de Simon, 29/09/2026). Le poste affiché vient
donc du référentiel **`BDD - Actions supplémentaires`** du classeur
national (`ActionReferenceService.gs`) : colonne « Action… » et colonne
« Poste… » / « Catégorie… » / « Thématique… », la ligne d'en-tête étant
cherchée dans les 10 premières lignes. Une action absente du référentiel
garde le poste saisi par le pôle. `testActionReference()` (à lancer
depuis l'éditeur) liste les actions absentes et les postes modifiés.

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

## Vue Contrôle

Pour chaque couple filière × action, compare l'univers de pôles attendu
(BDD NOMS) aux pôles ayant **au moins une ligne** pour cette action dans
IMPORT DONNEES — quel que soit l'avancement renseigné, y compris
`Abandonnée`. Un pôle sans aucune ligne pour une action n'est pas la même
chose qu'un pôle à 0 % : c'est une action non renseignée du tout par le
référent, pas une action en retard. Née d'un cas trouvé manuellement (des
sites CRC n'ayant jamais renseigné "Optimisation de la flotte") puis
généralisée à toutes les actions.

## Vue Par poste d'émissions

Reprend l'esprit des fiches « Trajectoire décarbonation 2024/2026 » de
Simon : une tuile encadrée par poste d'émissions, dans un ordre fixe
(`POSTE_ORDER` dans `Index.html` : énergie, transport/mobilité, achats,
immobilisations, déchets…, les postes inconnus à la fin), et dans chaque
tuile une ligne par action, triée par avancement décroissant. Filtres
filière / territoire comme la synthèse, plus les coches partagées. Chaque
ligne affiche :

- la **moyenne d'avancement** des couples pôle × action concernés (même
  calcul — non vérifié — que l'indicateur de la synthèse) ;
- une **jauge en 4 paliers** : 1 case dès > 0 %, 2 à partir de 25 %, 3 à
  partir de 50 %, 4 à partir de 75 %. Seuils relevés sur les exemples du
  support de Simon (43 % → 2 cases, 50 % → 3, 98 % → 4) ;
- le nombre de pôles concernés à 100 %.

- la **réduction carbone** (⬇ à date / cible), par carte, par poste et
  pour tout le périmètre : somme par pôle des réductions (points de % du
  bilan du pôle), puis **moyenne simple entre pôles**. Les pôles pilotes
  (au moins une valeur en kgCO2) sont exclus en entier et comptés à part.
  Menu « Réduction à date » : **selon l'avancement déclaré** (valeur de
  la colonne « Réduction carbone à date », par défaut) ou **pôles ayant
  terminé seulement** (réduction cible si l'action est à 100 % pour le
  pôle, 0 sinon — même logique que Simon, qui utilise le taux de terminés
  parmi les concernés ; repli sur la valeur à date quand la cible manque).
  Les autres différences avec le calcul de Simon (potentiel national non
  adapté au pôle, repas végétariens au tiers, cas déchets / véhicules
  électriques) restent.

Le lien vers l'outil de suivi de la filière choisie (onglet `Liens outils`,
colonne Code filière) s'affiche sous les filtres des vues Synthèse, Détail
et Par poste. Une ligne sans code filière est ignorée ; `testToolLinks()`
la signale comme « FILIERE INCONNUE » (au 25/09/2026 : 4 liens sans code
sous le tableau — Petite enfance, PADOM, Protection de l'enfance,
Outre-mer).

Pas encore affichés, par rapport au support de Simon : la part du poste dans l'empreinte, et
les indicateurs spécifiques qui ne sont pas des avancements (ex. taille de
flotte, part de véhicules électriques).

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

## Vue Évolution

Lit `HISTORIQUE TDB VA` (`HistoryService.gs`). Filtres campagne et filière
(ou ensemble). Contenu :

- courbes du **taux de terminés parmi les concernés**, une par action de
  la campagne, mois réels en abscisse (un mois sans valeur interrompt la
  courbe) ; survol ou flèches ← → pour lire toutes les valeurs d'un mois ;
- tableau **Évolution par action** : première et dernière valeur,
  évolution totale et sur le dernier mois (en points), rythme moyen par
  mois ;
- courbes du **taux de réponse par filière** (structures ayant répondu ÷
  nombre total de structures).

Les libellés d'action qui changent d'une archive à l'autre sont
regroupés (libellé sans sa parenthèse). Couleurs : palette catégorielle
de référence du skill dataviz, 8 séries au plus.

Anomalie relevée dans les archives : Protection de l'enfance à 0
répondant sur 17 en 07/2026 et 08/2026 (16 en 06 et 09/2026) — valeur de
l'archive elle-même, probablement une formule cassée au moment de la
copie.

À noter : la colonne TOTAL de ce tableau est un **taux de terminés parmi
les concernés** (ex. 127 / 187 = 67,9 % pour les repas végétariens en
09/2026), et c'est cette valeur que le calcul de trajectoire de Simon
utilise comme « avancement » — pas une moyenne des % d'avancement.

## Limites connues

- **PROT ENFANCE** n'a aucune ligne dans la zone SYNTHESE d'IMPORT DONNEES
  — ses données sont alimentées autrement dans le classeur national.
  Affiché comme « donnée non disponible », jamais comme un faux 0 %.
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

## Sujets ouverts avec Simon

1. **Sites ne renseignant pas certaines actions** — des sites CRC identifiés
   manuellement n'ont jamais renseigné "Optimisation de la flotte" (voir
   Vue Contrôle) ; à lui remonter.
2. ~~Catégories `Action filière` / `Action spécifique filière`~~ —
   tranché le 29/09/2026 : coche dédiée « Actions spécifiques filière »
   (voir plus haut). `Action structurante` et `Action supplémentaire`
   n'ont pas de coche dédiée.
3. **Colonnes "Réduction carbone à date" et "Réduction carbone cible"** —
   voir section suivante : les valeurs mélangent kgCO2 et pourcentages
   selon les lignes, sans référence de conversion connue à ce jour.
4. **Pôles avec des réductions en kgCO2** — résultat de
   `diagnosticReductionCarbone()` le 25/09/2026 (6 939 lignes, zone
   SYNTHESE) :

   | Colonne | en % | en kgCO2 | vide | autre |
   |---|---|---|---|---|
   | Réduction carbone à date | 4 661 | 324 | 1 954 | 0 |
   | Réduction carbone cible | 4 048 | 324 | 2 567 | 0 |

   Questions à poser :
   - **21 pôles** ont au moins une valeur en kg, et leurs codes sont tous
     de la forme `Territoire X : régions_numéros` (ex. `Territoire A : HDF
     - IDF - GE_1915`). Sont-ce bien les pôles pilotes du bilan carbone
     2023 ? Liste complète : relancer `diagnosticReductionCarbone()`.
   - `CMCR DES MASSUES`, pilote confirmé (valeurs en kg dans son fichier
     de suivi), n'apparaît **pas** dans cette liste : ses lignes en kg
     remontent-elles dans IMPORT DONNEES, et sous quel code ?
   - **613 lignes** ont une réduction à date en % mais **pas de cible**
     (4 661 − 4 048), alors que dans les fichiers de suivi « à date » est
     calculé à partir de la cible (cible × avancement). Les moyennes « à
     date » et « cible » de la vue Par poste ne portent donc pas exactement
     sur les mêmes lignes.

## Sujet ouvert : un indicateur unique de CO2 économisé (kg vs %)

Ces deux colonnes existent dans la zone SYNTHESE mais **ne sont pas encore
lues** par le code. Un extrait réel (24/09/2026) montre que l'unité change
selon la ligne, pour un même pôle :

- Certaines actions sont chiffrées en kg absolus, ex. `CMCR DES MASSUES` /
  *Repas végétariens* : `-59 700 kgCO2` à date / `-59 700 kgCO2` cible.
- D'autres actions, pour le **même pôle**, sont chiffrées en pourcentage,
  ex. `CMCR DES MASSUES` / *Tri des emballages* : `-0,49 %` à date / cible
  identique.

**Avancée du 25/09/2026** (formules relevées dans les fichiers de suivi
des sites, non encore reportées dans le code) :

- Sites non pilotes (ex. CMPR Le Clousis) : toutes les réductions sont en
  **points de % du bilan total du site**. Cible = réduction du catalogue ×
  part du poste dans le site ÷ part générique du poste (`'BDD - Bilan
  carbone'`) ; à date = cible × avancement.
- Sites pilotes du bilan carbone 2023 (ex. CMCR DES MASSUES, bilan 2021
  de 6 224,5 tCO2) : le tableau `PA_<site>` est en **kgCO2** (divisé par
  1000 dans le bilan du site), le tableau `PAS_<site>` en **% du bilan
  total** (multiplié par le total, cellule H18). Les deux se convertissent
  donc exactement avec le bilan total du pôle : −59 700 kg / 6 224,5 t =
  −0,96 point.
- Décision : l'indicateur affiché sera **un % par pôle**. Il manque le
  bilan total de chaque pôle pilote dans le classeur national (il n'est
  que dans le fichier de suivi de chaque site) — `'BDD - Bilan carbone'`
  ne contient que des répartitions génériques en %, pas de tonnes.
- À signaler : dans la formule du bilan cible de MASSUES, le second
  `SOMME.SI.ENS` somme `PAS_Massues[Réduction cible]` avec le critère
  `PA_Massues[Poste d'émissions]` (plages de deux tableaux différents) —
  probablement une erreur de saisie, à vérifier.

**Implémenté pour les pôles non pilotes** (vue Par poste) : les valeurs
affichées sont lues telles quelles (`"-0,10%"`), une valeur contenant
« kg » marque le pôle comme pilote et l'exclut. `diagnosticReductionCarbone()`
(IndicatorService.gs, à lancer depuis l'éditeur) recense les formats
réellement présents et la liste des pôles détectés comme pilotes.

Combiner les deux en un seul indicateur nécessite de savoir si les
pourcentages sont exprimés par rapport à un total (bilan carbone du pôle)
qui permettrait de les reconvertir en kg — ce total n'a pas été localisé
dans le classeur à ce jour. Tant que cette conversion n'est pas confirmée,
sommer les deux colonnes telles quelles produirait un chiffre faux mais
d'apparence plausible. À vérifier avec Simon avant toute implémentation.

## Historique de développement

Le détail des diagnostics, bugs corrigés et décisions prises au fil de
l'eau vit dans l'historique des commits (messages détaillés) plutôt que
dupliqué ici.
