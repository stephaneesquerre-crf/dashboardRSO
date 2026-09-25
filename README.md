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
| Poste d'émissions               | `thematique`  | oui |
| Avancement                      | `avancement`  | oui |
| Filière                         | `filiere`     | oui (repli seulement si le pôle est introuvable dans BDD NOMS) |
| Action socles                   | `actionSocle` | oui (voir plus bas) |
| Objectif, Référent de l'action, Mise en place (texte), Outil, Noms | — | non |
| **Réduction carbone à date / cible** | — | **non — voir « Sujet ouvert : CO2 en kg/% » ci-dessous** |

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

## Colonne "Action socles" et coche "Actions socle uniquement"

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

La coche **« Actions socle uniquement »** (renommée le 25/09/2026, ex-
« Actions actuellement suivies » ; un seul état partagé entre les vues
Synthèse, Détail, Contrôle et Par poste — `state.trackedOnly`
dans `Index.html`, fonction `isCurrentlyTrackedAction`) ne garde **que**
les lignes `Action socle <année>`, toutes années confondues. Décision
explicite du 24/09/2026 : les catégories `Action filière`, `Action
spécifique filière` et `Action structurante` restent à trancher avec Simon
et sont donc exclues pour l'instant, comme `Action supplémentaire` et les
lignes non classées.

Le **Top 3 / Bottom 3** de la vue Synthèse applique une règle **séparée et
plus stricte** : uniquement l'année `Action socle` la plus récente trouvée
dans les données (détectée dynamiquement, `computeLatestActionSocleYear` —
jamais une année figée en dur), sans compter `Action filière` etc.

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

Reprend la mise en forme des fiches « Trajectoire décarbonation 2024/2026 »
de Simon : une carte par action, groupées par poste d'émissions (colonne
`Poste d'émissions`, champ `thematique`). Filtres filière / territoire
comme la synthèse, plus la coche partagée. Chaque carte affiche :

- la **moyenne d'avancement** des couples pôle × action concernés (même
  calcul — non vérifié — que l'indicateur de la synthèse) ;
- une **jauge en 4 paliers** : 1 case dès > 0 %, 2 à partir de 25 %, 3 à
  partir de 50 %, 4 à partir de 75 %. Seuils relevés sur les exemples du
  support de Simon (43 % → 2 cases, 50 % → 3, 98 % → 4) ;
- le nombre de pôles concernés à 100 %.

Pas encore affichés, par rapport au support de Simon : la réduction
carbone (⬇ %, cf. sujet ouvert CO2), la part du poste dans l'empreinte, et
les indicateurs spécifiques qui ne sont pas des avancements (ex. taille de
flotte, part de véhicules électriques).

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
2. **`Action filière` / `Action spécifique filière` / `Action structurante`**
   — doivent-elles compter dans la coche « Actions socle uniquement »
   partagée ? Actuellement exclues par défaut.
3. **Colonnes "Réduction carbone à date" et "Réduction carbone cible"** —
   voir section suivante : les valeurs mélangent kgCO2 et pourcentages
   selon les lignes, sans référence de conversion connue à ce jour.

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
