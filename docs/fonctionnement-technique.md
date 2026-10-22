# Fonctionnement technique

Chargement, cache, droits d'accès et contrôles automatiques des données. Sections reprises de l'ancien README.

## Cache du chargement (22/10/2026)

Mesure avant le cache, sur les vraies données : 6,5 s côté serveur
(dont 3,5 s de vérification des accès) et 9,2 s vues par le navigateur, à
chaque ouverture et pour chaque personne.

- **Données gardées 10 minutes** (`BOOTSTRAP_CACHE_SECONDS_`,
  `BootstrapCacheService.gs`) dans le cache du script, commun à toutes les
  personnes. Les ouvertures suivantes ne relisent plus les classeurs. Les
  données sont compressées et découpées en morceaux (une valeur du cache
  Apps Script est limitée à 100 Ko).
- **Bouton « 🔄 Actualiser les données »** (en-tête de la page) : relit
  tous les classeurs et remplace le cache, sans recharger la page. La
  ligne sous le titre indique l'heure de lecture des données.
- **Droits** : le contrôle d'accès reste fait pour chaque personne ; son
  résultat est gardé 30 minutes dans le cache de cette personne
  (`ACCESS_CACHE_SECONDS_`). Un refus n'est pas gardé. Une personne sans
  accès aux archives ou aux référents ne reçoit pas ces données depuis le
  cache. Une lecture faite par une personne qui ne voit pas tous les
  classeurs n'est pas mise en cache. Le contrôle passe par l'API Sheets
  (service avancé) quand il est activé, plus léger que l'ouverture du
  classeur.
- **Cache vidé automatiquement** quand l'historique des archives est
  réécrit (bouton « Rafraîchir les archives » ou déclencheur horaire). À
  la main : exécuter `viderCacheDashboard()` dans l'éditeur.
- **Après un déploiement qui change la forme des données** (nouveau champ
  envoyé à la page), changer `BOOTSTRAP_CACHE_KEY_` (ex. `-v2`) pour que
  l'ancien cache soit ignoré ; sinon il disparaît seul en 10 minutes.
- **Préchargement (facultatif)** : un déclencheur horaire sur
  `prechargerDashboard` (éditeur Apps Script → Déclencheurs → Ajouter →
  fonction `prechargerDashboard`, source « Déclencheur horaire », toutes
  les 5 minutes) recharge le cache avant qu'il expire : personne n'attend
  la lecture complète. Il tourne avec les droits du compte qui le crée,
  qui doit avoir accès aux trois classeurs. Non installé à ce jour.
- Les fonctions de diagnostic de l'éditeur (`diagnosticDashboard`,
  `lancerTests`…) lisent toujours les classeurs, sans le cache.

## Accès aux classeurs et temps de chargement (14/10/2026)

- **Écran « demander l'accès »** : avec un déploiement « Exécuter en tant
  que : utilisateur accédant à l'application », chaque personne lit les
  classeurs avec son propre compte. `checkSpreadsheetAccess_`
  (`IndicatorService.gs`) teste l'accès à chaque classeur avant lecture.
  Sans accès au classeur national, la page affiche un lien par classeur
  manquant au lieu d'une erreur : ce lien ouvre la page Google du fichier,
  qui propose le bouton « Demander l'accès » (demande envoyée au
  propriétaire). Sans accès aux archives ou aux référents, le reste
  s'affiche et l'encadré en tête de page donne le lien. `ACCESS_CONTACT`
  (`Config.gs`) : personne ou boîte à contacter, affichée sur l'écran.
- **Lectures groupées** : les trois onglets lus en valeurs affichées du
  classeur national (`IMPORT DONNEES` AM:AZ, `BDD NOMS`,
  `BDD - Actions supplémentaires`) sont lus en une seule requête
  `Sheets.Spreadsheets.Values.batchGet` (service avancé Sheets, déjà
  activé pour les liens outils). En cas d'échec, lecture onglet par
  onglet comme avant (`prefetchDisplayValues_`, `Utils.gs`).
- **Durées** : la durée de chaque étape du chargement s'affiche dans
  « Contrôle et méthodologie » et dans le journal de
  `diagnosticDashboard()`, pour cibler les optimisations suivantes sur les
  vraies données.

## Points à vérifier et diagnostics

À chaque chargement, le serveur contrôle les données et l'appli affiche
un encadré « points à vérifier » en tête de page si besoin : colonne
Territoire introuvable, en-têtes en double dans `BDD NOMS`, filière sans
aucun territoire, codes pôle d'IMPORT DONNEES absents de `BDD NOMS`,
référentiel des actions ou historique illisibles, liens outils
indisponibles. `diagnosticDashboard()` (à lancer depuis l'éditeur) donne
le même bilan plus le détail des colonnes réellement utilisées et la
taille du chargement.

**Incident du 01/10/2026 (territoires absents pour toutes les filières)** :
non reproduit avec des données conformes ; reproduit à l'identique avec
l'ancien code dès que `BDD NOMS` contient une seconde colonne
« Territoire » vide (les lignes étaient indexées par nom d'en-tête, la
dernière colonne homonyme écrasait la bonne) ou une colonne vide dont
l'en-tête commence par « Territoire » placée avant la bonne. Corrigé par
la lecture par position et le choix de la colonne la mieux remplie ; la
cause exacte côté Sheet est à confirmer avec `diagnosticDashboard()`.
