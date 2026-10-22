# Sujets ouverts

Questions en suspens sur les données. Sections reprises de l'ancien README (« Sujets ouverts avec Simon »).

## Sujets ouverts

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
