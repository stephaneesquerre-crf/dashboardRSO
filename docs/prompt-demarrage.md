# Démarrer une conversation avec un assistant IA

Le dépôt GitHub est privé : un assistant ne peut pas le lire à partir du
seul lien. Deux façons de travailler.

## 1. Assistant relié au dépôt (Claude Code)

Claude Code sur le web (claude.ai/code) ouvre le dépôt, lit `CLAUDE.md`
automatiquement, lance les tests et enregistre les modifications sur
GitHub. Prérequis : être collaborateur du dépôt et relier son compte
GitHub à son compte Claude (claude.ai/connect-github). Il suffit alors
de décrire la modification voulue.

## 2. N'importe quel assistant (Claude, ChatGPT, Gemini…)

Le code fait environ 370 Ko, dont 265 Ko pour `Index.html` : trop pour
le joindre en entier à beaucoup d'assistants. On joint donc `CLAUDE.md`
et seulement les fichiers utiles à la tâche.

### Message de départ à copier

> Tu m'aides à faire évoluer le Dashboard RSO de la Croix-Rouge
> française, une web app Google Apps Script. Le fichier `CLAUDE.md` joint
> décrit le projet, ses fichiers et les règles à respecter : lis-le
> avant de répondre.
>
> Ce que je veux faire : [décrire la modification ou le problème, avec
> la vue concernée et, si possible, un exemple de chiffre ou une capture].
>
> Avant de proposer du code :
> 1. dis-moi quels fichiers ou quelles fonctions tu as besoin de voir,
>    si je ne les ai pas joints ; pour `Index.html`, demande-moi la
>    fonction par son nom plutôt que le fichier entier ;
> 2. reformule ce que tu as compris et pose-moi tes questions si la
>    demande n'est pas claire.
>
> Quand tu proposes une modification :
> - respecte les règles de `CLAUDE.md` ;
> - donne le code complet de chaque fonction modifiée et dis dans quel
>   fichier la remplacer ;
> - indique ce qu'il faut mettre à jour dans la documentation (`docs/`,
>   `HISTORIQUE.md`) ;
> - dis-moi comment vérifier le résultat (`lancerTests`, vue et filtre à
>   regarder).

### Fichiers à joindre selon la tâche

Toujours joindre `CLAUDE.md`. Puis :

| Tâche | Fichiers à joindre |
|---|---|
| Un chiffre semble faux | `docs/regles-de-calcul.md`, la fonction de calcul de la vue dans `Index.html` (voir les repères de `CLAUDE.md`), le résultat de `diagnosticDashboard` |
| Modifier l'affichage d'une vue | `docs/vues.md`, la partie de `Index.html` qui commence par `// Vue …` |
| Une colonne ou un onglet a changé dans un classeur | `Config.gs`, le fichier `…Service.gs` qui lit cet onglet, `Utils.gs` |
| Nouvelle campagne d'actions socles | `README.md` (« Mettre à jour les actions socles ») |
| Lenteur, accès refusé, cache | `docs/fonctionnement-technique.md`, `IndicatorService.gs`, `BootstrapCacheService.gs` |
| Vue Évolution, archives | `HistoryService.gs`, `ArchiveImportService.gs`, la partie « Vue Évolution » de `Index.html` |
| Vue Référents | `ReferentsService.gs`, la partie « Vue Référents » de `Index.html` |
| Erreur au chargement ou dans `lancerTests` | le message d'erreur complet, le journal de `lancerTests`, le fichier cité dans l'erreur |

Pour extraire une fonction de `Index.html` : ouvrir le fichier sur
GitHub, rechercher `function nomDeLaFonction(` et copier jusqu'à
l'accolade fermante correspondante.

### Après la conversation

Recopier chaque fichier modifié en entier dans l'éditeur Apps Script,
exécuter `lancerTests`, puis publier une nouvelle version (procédure dans
`README.md`). Enregistrer aussi les fichiers modifiés sur GitHub : les
deux doivent rester identiques.
