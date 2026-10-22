# Les vues du dashboard

Contenu et choix d'affichage de chaque onglet. Sections reprises de l'ancien README ; les dates indiquent quand un élément a été ajouté ou modifié.

## Organisation des onglets (01/10/2026)

1. **Évolution des actions socles** (onglet ouvert par défaut)
2. **Synthèse**
3. **Détail par poste d'émissions**
4. **Détail par pôle** (ex « Détail pôle × action »)
5. **Référents** (08/10/2026)
6. **Contrôle et méthodologie** (les deux anciennes vues, dans un même
   onglet)

## Vue Synthèse

Barres toujours triées de la plus grande à la plus petite valeur (le
tableau garde son ordre). Indicateur par défaut : « Terminées /
concernées ». « Regrouper par » ne propose que les regroupements utiles au
périmètre : Filière (toutes filières), Territoire (une filière entière, ex-
option « Tous les territoires (détail) » du filtre Territoire),
Thématique, Campagne (ex-« Volet »), Action.

Tableau « Détail des données » (08/10/2026, retour de Simon) : toujours le
même tableau, une ligne par action (thématique, campagne, % terminés, pôles
ayant terminé, pôles concernés), que le périmètre soit toutes filières, une
filière ou un territoire. L'ancien tableau par filière (concernées, taux de
réponse…) n'est plus affiché ni exporté ; ces chiffres restent dans le
graphique et la fiche d'identité. Un clic sur une ligne ouvre le Détail par
pôle seulement quand une filière est choisie (cette vue en exige une). Graphique principal, graphique de comparaison et
fiche d'identité sur une même ligne (sous 1200px de large, le graphique principal passe seul sur sa
ligne). Au-delà de 10 groupes (`HORIZONTAL_BAR_THRESHOLD`), les graphiques
passent en barres horizontales pour que les libellés restent lisibles
(ex. regroupement par action).

### Couleurs des années socle dans « Détail des données » (22/10/2026)

- **Synthèse, tableau « Détail des données »** : chaque ligne est
  teintée selon l'année socle de l'action (colonne « Action socles »),
  avec les couleurs de l'outil de suivi : 2024 vert pastel, 2025 bleu
  pastel, 2026 rouge pastel. Une action sans année socle (action filière,
  supplémentaire…) ou rattachée à plusieurs années dans le périmètre
  n'est pas teintée. Pour les socles 2027 : ajouter
  `--socle-2027` dans le style (modes clair et sombre), la règle CSS
  correspondante et l'année dans `SOCLE_COLOR_YEARS` (`Index.html`).

### Libellés des territoires (22/10/2026)

- **Libellés des territoires** : la vue Référents (filtre et colonne
  Territoire), le graphique Synthèse regroupé par territoire, son titre et
  la fiche d'identité affichent « Territoire A · HDF - IDF - GE » (colonne
  régions de `BDD NOMS`), comme les filtres des autres vues. Le nom court
  reste la valeur des filtres : un clic sur une barre ouvre toujours le
  Détail par pôle sur le bon territoire. Sur le graphique en barres
  verticales, un libellé de plus de 28 caractères est abrégé (« … ») ; le
  libellé complet s'affiche au survol.

## Vue Détail par pôle

### Repères visuels (20/10/2026)

- **Détail par pôle** : les en-têtes de colonnes alternent deux teintes
  d'un territoire à l'autre, et un filet vertical sépare deux territoires,
  comme dans le reporting national. Survol d'un pôle : code et territoire.

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
  Menu « Indicateur » : **pôles ayant terminé seulement** (par défaut
  depuis le 13/10/2026 ; réduction cible si l'action est à 100 % pour le
  pôle, 0 sinon — même logique que Simon, qui utilise le taux de terminés
  parmi les concernés ; repli sur la valeur à date quand la cible manque)
  ou **selon l'avancement déclaré** (valeur de la colonne « Réduction
  carbone à date »). Depuis le 13/10/2026, le menu change aussi le taux et
  la jauge des tuiles (terminées / concernées, ou avancement moyen) et
  l'ordre des actions dans chaque tuile.
  Les autres différences avec le calcul de Simon (potentiel national non
  adapté au pôle, repas végétariens au tiers, cas déchets / véhicules
  électriques) restent.

Le lien vers l'outil de suivi de la filière choisie (onglet `Liens outils`,
colonne Code filière) s'affiche sous les filtres des vues Synthèse, Détail
et Par poste. Une ligne sans code filière est ignorée ; `testToolLinks()`
la signale comme « FILIERE INCONNUE » (au 25/09/2026 : 4 liens sans code
sous le tableau — Petite enfance, PADOM, Protection de l'enfance,
Outre-mer).

Colonne « À date / cible (%) » : les deux valeurs dans une même cellule
(ex. `-0,16 / -0,23`), pour garder 4 colonnes par tuile.

**Trajectoire de décarbonation** (à gauche des tuiles, 02/10/2026) : une
étape par année socle (colonne « Action socles » : `Action socle 2024`,
`2025`…). Pour chaque année, réduction cible et à date = moyenne par pôle
de la somme des actions de cette campagne (`aggregateReductionByPole`, avec
les mêmes options pôles pilotes / terminés seulement que les tuiles), puis
cumul année après année — même principe d'empilement que le calcul de
Simon. Axe des années avec origine 2023 (bilan de référence, 0 %) ; le
cumul après les actions socle N est porté sur l'année N (2024, 2025…).
Objectif 2030 de −37,8 % (SBTi, repris du support de Simon) en ligne
horizontale avec son point, constante `TRAJECTOIRE_REFERENCE` dans
`Index.html` (la droite −5 %/an a été retirée le 02/10/2026). Sous le
graphique, le détail de chaque année socle : actions avec à date / cible.
Limite : la moyenne de chaque année porte sur les pôles ayant des valeurs
pour cette campagne, qui ne sont pas forcément les mêmes d'une année à
l'autre.

**Pôles pilotes** : **toujours inclus** (décision de Simon, 02/10/2026 ; le
menu qui permettait de les exclure a été retiré). Pour chaque action d'un pôle
pilote, cible = réduction du catalogue (colonne « Réduction… » de
`BDD - Actions supplémentaires`, toujours comptée comme une baisse) et à
date = cible × avancement du pôle. C'est le calcul d'un pôle non pilote
**sans** l'ajustement au profil d'émissions (part du poste dans le pôle ÷
part générique), faute de répartition par poste pour ces pôles.
`testActionReference()` affiche la colonne Réduction trouvée et des
exemples de valeurs.

Libellés d'action : le préfixe parasite « Action socle - » (ex. « Action
socle - Repas végétariens ») est retiré à la lecture (`cleanActionLabel_`
dans `Utils.gs`), pour toutes les vues.

Pas encore affichés, par rapport au support de Simon : la part du poste dans l'empreinte, et
les indicateurs spécifiques qui ne sont pas des avancements (ex. taille de
flotte, part de véhicules électriques).

### Actions spécifiques filière (20/10/2026)

- **Détail par poste d'émissions** : une action spécifique à la filière
  (colonne « Action socles » = « Action filière » ou « Action spécifique
  filière ») porte l'étiquette « Spécifique filière » et un trait de
  couleur à gauche de sa ligne. Étiquette texte plutôt que couleur seule :
  lisible sans légende, en image exportée et par un lecteur d'écran. Le
  CSV des tuiles a une colonne « Type d'action » ; le tableau copié ajoute
  « (spécifique filière) » au nom de l'action.

### Tableau des tuiles (13/10/2026)

- **Tableau des tuiles** (Détail par poste) : bouton « CSV » et « Copier »
  sur chaque tuile, « Tableau des tuiles (CSV) » et « Copier le tableau »
  pour toutes. CSV : une ligne par action et une ligne « Total du poste »
  (périmètre, indicateur choisi, les deux taux, pôles ayant terminé /
  concernés, réduction à date / cible, pôles comptés). « Copier » place un
  tableau HTML dans le presse-papiers : collé dans Google Slides ou Docs,
  il devient un tableau modifiable (non lié aux données).

## Vue Évolution des actions socles

Lit `HISTORIQUE TDB VA` (`HistoryService.gs`). Indicateur unique : taux de
terminés parmi les concernés. Filtres : filière (ou ensemble) et
**Regrouper par** campagne ou thématique (02/10/2026, remplace le choix
d'une campagne). Contenu :

- **Avancée par campagne / par thématique** : une courbe par groupe
  (moyenne simple des actions du groupe ayant une valeur ce mois-là). La
  thématique d'une action vient des faits du dashboard (référentiel des
  actions), les archives ne la contenant pas ;
- **Avancée par filière** (toutes campagnes) : une courbe par filière plus
  l'ensemble ; la filière choisie est mise en avant, les autres en gris ;
- **Détail par action** : petits multiples de toutes les actions, groupés
  par campagne ou par thématique, même échelle et mêmes mois pour tous ;
- export CSV de la vue (séries au format long).

Retirés le 02/10/2026 : le graphique « Taux de réponse par filière » et le
tableau « Évolution par action ».

Limite des moyennes : quand une nouvelle campagne ajoute des actions encore
peu avancées à une thématique, la courbe de cette thématique peut baisser
sans recul réel (effet de composition) ; le détail par action permet de le
vérifier.

Pourquoi des courbes et pas un radar : l'axe du temps est la dimension
principale ; un radar la replie en cercle, rend l'ordre des axes
arbitraire et devient illisible au-delà de 2-3 séries superposées
(Stephen Few, *Keep Radar Graphs Below the Radar*, 2005 ; data-to-viz,
*The Radar chart and its caveats*). Les 7-8 courbes superposées de la
première version sont remplacées par des petits multiples, et le nombre
de séries par graphique est limité à 3 (années socle) ou mis en retrait
(filière mise en avant), conformément au skill dataviz (« series-count
ladder », forme « emphasis »).

Mois de l'historique : Google Sheets convertit « 2026-09 » en date à
l'écriture ; la colonne Mois est désormais écrite en texte brut et toute
date relue est ramenée au format AAAA-MM (`historyMonthKey_`).

Les libellés d'action qui changent d'une archive à l'autre sont
regroupés (libellé sans sa parenthèse). Couleurs : palette catégorielle
de référence du skill dataviz, 8 séries au plus.

**Valeurs inconnues = point absent, jamais 0** (`historyRows` dans
`Index.html`, règles établies sur les archives 09/2025 → 09/2026) :

- campagne avant son année (socle 2026 en 11/2025 : 30 zéros écartés) ;
- filière sans aucun répondant ce mois-là (Protection de l'enfance
  07 et 08/2026) : toutes ses valeurs du mois, taux de réponse compris ;
- 0 terminé alors que les concernés = toutes les structures de la
  filière et que toutes n'ont pas répondu (valeurs par défaut ; ex.
  Petite enfance 09/2026, après le changement d'outil : écoconduite,
  vélos, 2e journée végétarienne) ;
- indicateurs DIP (« Indic. DIP » : véhicules électriques, optimisation
  de la flotte) : écartés dès l'import (réimporter les archives).

Anomalie relevée dans les archives : Protection de l'enfance à 0
répondant sur 17 en 07/2026 et 08/2026 (16 en 06 et 09/2026) — valeur de
l'archive elle-même, probablement une formule cassée au moment de la
copie.

À noter : la colonne TOTAL de ce tableau est un **taux de terminés parmi
les concernés** (ex. 127 / 187 = 67,9 % pour les repas végétariens en
09/2026), et c'est cette valeur que le calcul de trajectoire de Simon
utilise comme « avancement » — pas une moyenne des % d'avancement.

### Note sur les baisses des courbes (22/10/2026)

- **Vue Évolution** : encadré sous les filtres expliquant que les courbes
  baissent quand le nombre de répondants augmente ou quand un pôle est
  divisé en plusieurs outils de suivi.

## Vue Référents (08/10/2026)

Classeur « Synthèse référents Environnement » (`REFERENTS_SPREADSHEET_ID`,
`ReferentsService.gs`) :

- **taux de couverture par filière**, courbes à partir des photographies de
  l'onglet `Evolution référents` (une valeur par mois : la dernière
  photographie du mois) ; par filière seulement ;
- **indicateurs** du périmètre (filière, territoire) : taux de couverture =
  pôles de la liste ayant un·e référent·e 1 ÷ pôles de la liste ; nombre de
  référent·es 1, 2 et 3 (un·e référent·e compte dès que son nom **ou** son
  adresse mail est renseigné : pour PADOM, le nom est souvent vide) ;
- **couverture par filière — dernière valeur** (12/10/2026) : une ligne par
  filière, avec la dernière photographie de `Evolution référents` (filière
  entière) et, si la filière figure dans `IMPORT REFERENTS`, le taux
  recalculé sur la liste ; triée par taux décroissant, filière choisie en
  gras ;
- **liste** des référent·es par pôle (onglet `IMPORT REFERENTS`), territoire
  repris de `BDD NOMS` via le code pôle ; colonne « Directeur·rice de
  territoire » (colonne `DT (directeur territorial)`, texte affiché tel
  quel) ; nom du ou de la référent·e cliquable (`mailto:`) quand l'adresse
  est renseignée ; tri par pôle, filière ou territoire en cliquant sur
  l'en-tête (par défaut : territoire puis pôle).
- code pôle absent de `BDD NOMS` : l'avertissement en tête de page les
  regroupe par filière (« PA : code1, code2 ; FLEX : … ») ; dans la liste,
  le territoire est « — » (survol : code et filière).

Constats sur la copie du 08/10/2026 : la liste ne couvre que FLEX, PA et
DOM ; il n'y a pas de colonne « Référent.e 3 » (elle sera lue si elle est
ajoutée, intitulée « Référent.e 3 … ») ; FLEX : 24 pôles couverts sur 32,
soit 75 %, identique à la dernière photographie (0,75).

### Listes des référents (20/10/2026)

- **Listes des référents** (`ReferentsService.gs`, revu le 20/10/2026) :
  l'onglet `IMPORT REFERENTS` regroupe les listes de toutes les filières,
  un bloc par filière (en-tête, pôles, « LIGNE DE FIN DES DONNEES », lignes
  de synthèse). Chaque bloc est lu avec ses propres colonnes (le bloc CRC
  a un en-tête « Code » au lieu de « Code Pôle ») ; les lignes entre une
  ligne de fin et l'en-tête suivant sont ignorées ; une ligne en double
  (bloc Petite enfance présent deux fois) n'est lue qu'une fois. Filières
  « PROT.E. » et « PE » reconnues. Les fichiers de la colonne « Liens
  référents » (`Liens outils référents`) ne sont ouverts que pour une
  filière absente de `IMPORT REFERENTS`. Codes pôle rapprochés de
  `BDD NOMS` : code identique, sinon sans le suffixe « - 1 » / « - 2 »,
  sinon mêmes numéros d'établissement (libellé de territoire différent).
  `testListesReferents()` affiche les sources lues et le nombre de pôles
  par filière.
  « DNOM » (onglet `Evolution référents`) = DOM. Le tableau par pôle
  affiche le code pôle tel qu'écrit dans la liste (survol : code de
  `BDD NOMS` rapproché quand il diffère) et peut être trié par code.

### Mise en page (20/10/2026)

- **Vue Référents** : la carte « Couverture par filière — dernière valeur »
  est sous la carte « Couverture », à gauche du graphique.

## Vue Contrôle

Pour chaque couple filière × action, compare l'univers de pôles attendu
(BDD NOMS) aux pôles ayant **au moins une ligne** pour cette action dans
IMPORT DONNEES — quel que soit l'avancement renseigné, y compris
`Abandonnée`. Un pôle sans aucune ligne pour une action n'est pas la même
chose qu'un pôle à 0 % : c'est une action non renseignée du tout par le
référent, pas une action en retard. Née d'un cas trouvé manuellement (des
sites CRC n'ayant jamais renseigné "Optimisation de la flotte") puis
généralisée à toutes les actions.

## Export en image et indicateur de chargement (13/10/2026)

- **Bouton « ⤓ Image (PNG) »** sur chaque graphique et carte (Synthèse :
  graphique principal, comparaison, fiche d'identité ; Détail par poste :
  trajectoire, panneau des tuiles et bouton « ⤓ » sur chaque tuile ;
  Évolution : les deux graphiques et le détail par action ; Référents :
  couverture, graphique, couverture par filière). L'image reprend le
  panneau entier (titre, légende, graphique, note), sans les boutons, dans
  le thème affiché (clair ou sombre), en résolution double. Fonction
  `exportElementAsPng` (`Index.html`) : styles calculés recopiés, SVG
  `foreignObject`, canvas. La police Poppins est intégrée à l'image quand
  Google Fonts répond ; sinon police système (mise en page parfois un peu
  différente). L'export SVG du graphique de la Synthèse est conservé.
  Non couverts : les tableaux (Détail par pôle, Contrôle, listes), qui
  ont leur export CSV.
- **Chargement** : tant que les données ne sont pas arrivées, les onglets
  sont masqués et un encadré « ⏳ Chargement des données en cours… (N s) »
  s'affiche, avec un message complémentaire au-delà de 30 s. En cas
  d'échec, l'encadré affiche le message d'erreur.
