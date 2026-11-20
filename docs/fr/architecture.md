# BezotCorp AI — Architecture

[Documentation](../docs_index.md) · [English](../en/architecture.md)

Ce document décrit l'architecture technique actuelle de BezotCorp AI.

Les points d'étape historiques datés sont des instantanés et ne sont pas actualisés lorsque l'implémentation évolue.

## Exécution de l'extension

BezotCorp AI est une extension VS Code écrite en TypeScript.

L'extension coordonne les sessions de conversation, les fournisseurs IA, la gestion des modèles, la préparation du contexte, les outils intégrés, les outils MCP, les permissions, la sécurité des opérations sur les fichiers, la récupération persistante de ces opérations et l'interface webview de VS Code.

Il n'existe aucun outil d'exécution arbitraire de shell ou de commande générique.

## Fournisseurs IA

L'abstraction des fournisseurs prend actuellement en charge Ollama, les backends personnalisés et une future intégration au backend BezotCorp.

Ollama prend en charge le fonctionnement actuel des appels d'outils.

Le backend personnalisé reçoit actuellement l'historique de conversation, mais ne propose pas encore les outils.

## Modèle de conversation

Les conversations sont stockées sous forme de sessions indépendantes.

Une session contient un identifiant stable, un titre, des dates de création et de modification, des messages et des états facultatifs d'archivage et de mise à la corbeille.

L'implémentation permet de créer, sélectionner, renommer, archiver, restaurer, mettre à la corbeille, supprimer définitivement et vider les conversations.

Les sessions archivées ou dans la corbeille ne peuvent pas devenir actives avant leur restauration.

L'historique conserve les appels et résultats d'outils nécessaires aux échanges suivants avec le modèle.

Les résultats d'outils sont stockés entiers dans `chat.json`. La limite de ce qu'un tour antérieur peut apporter à une requête n'est appliquée qu'au moment où l'historique est rejoué au modèle. Ce stockage exhaustif est transitoire : les quatre niveaux de mémoire sont spécifiés mais pas implémentés, il ne suit donc encore le contrat de rétention d'aucun niveau.

Chaque appel d'outil stocké peut aussi porter des observations de fichiers : ce que les outils fichiers ont retenu d'un fichier pendant cet appel (SHA-256 du fichier entier, si le modèle l'a reçu en entier, texte exact d'une vue partielle, et comment le modèle a connu cette version). Elles décrivent le passé, ne sont jamais envoyées au modèle et ne disent rien du contenu d'une requête ultérieure. Une vue complète ne garde que le SHA ; aucune position dans le fichier n'est enregistrée. Les conversations stockées avant ce champ se chargent sans observations.

## Contexte

Le fichier actif dans l'éditeur est joint automatiquement lorsqu'il est disponible.

Le contexte supplémentaire du projet est découvert explicitement par les outils, plutôt que par injection automatique du projet entier.

Cette découverte utilise :

- `list_files`
- `read_file`
- `read_files`
- `search_text`

## Système d'outils

Les outils intégrés sont enregistrés explicitement.

Un outil indisponible en raison de la confiance accordée à l'espace de travail, du mode d'autonomie ou d'un refus mémorisé n'est pas présenté au modèle comme utilisable.

Il n'existe aucun outil de shell générique.

### Opérations élémentaires et outils composés

Les outils de fichiers sont soit élémentaires, soit composés.

Les outils élémentaires portent l'opération concrète qu'ils réalisent ; la politique d'autorisation reste centralisée dans le système de permissions.

`read_file` est le point de passage élémentaire pour acquérir le contenu d'un fichier existant. Avant d'obtenir le moindre octet, il consulte `ToolAccessGuard`. Ce garde porte la politique de permissions : règles mémorisées `allow` / `ask` / `deny`, autorisations de ressources, confirmation des ressources protégées, limites de l'espace de travail, mode d'autonomie et état de révocation.

Les modes de lecture internes, vérifications SHA, tentatives supplémentaires et décisions de cache n'accordent jamais l'accès et ne contournent jamais ce contrôle.

Tout outil composé ayant besoin du contenu d'un fichier existant doit déléguer son acquisition effective à `read_file`, plutôt que d'appeler directement le système de fichiers ou de réimplémenter les règles de protection.

En particulier :

- `read_files` délègue chaque lecture à `read_file` ;
- `search_text` utilise `read_file` pour obtenir le contenu dans lequel chercher ;
- `update_file` utilise `read_file` lorsqu'il a besoin du contenu existant pour préparer une modification ou en rendre compte.

Les outils composés peuvent avoir leur propre autorisation pour leurs effets : `update_file` doit par exemple autoriser l'écriture. Ils ne doivent cependant pas créer un second chemin de lecture du contenu des fichiers.

Le même principe s'applique aux autres opérations élémentaires : l'opération est implémentée une seule fois, et le système central de permissions décide si l'accès ou l'effet demandé est autorisé.

### Outils de fichiers

Lecture et découverte :

- `read_file`
- `read_files`
- `list_files`
- `search_text`

Création :

- `create_file`
- `create_files`

Modification :

- `update_file`
- `update_files`

Déplacement :

- `move_file`
- `move_files`

Suppression :

- `delete_file`
- `delete_files`

Les outils pluriels délèguent à leur équivalent singulier afin de conserver des règles de permissions et de sécurité identiques.

## Sécurité des modifications de fichiers

`update_file` permet le remplacement exact d'un texte et le remplacement complet du contenu d'un fichier.

Les remplacements exacts ambigus sont refusés.

L'extension suit le contenu exact du fichier transmis au modèle pendant la génération.

Avant d'appliquer une modification, elle vérifie que le fichier correspond toujours au contenu sur lequel le modèle a travaillé.

Une nouvelle vérification ne contrôle que la fraîcheur du contenu. Elle ne réutilise ni n'invente une permission : si le contenu doit être acquis de nouveau, l'état actuel des permissions est consulté avant la lecture.

Les modifications de fichiers existants utilisent une chaîne d'écriture persistante avec copie de sécurité, transitions d'état persistées, vérification d'intégrité, restauration et récupération des opérations interrompues. Les lectures internes de sauvegarde, de SHA, d'intégrité et de restauration sont des étapes d'implémentation de la transaction d'écriture déjà autorisée ; elles ne sont pas des lectures de contenu destinées au modèle et n'injectent pas le contenu dans le contexte de l'IA.

## Outils Git

Git est exposé par des outils dédiés et délimités :

- `git_status`
- `git_diff`
- `git_log`
- `git_show`
- `git_branch_list`
- `git_add`
- `git_unstage`
- `git_commit`
- `git_branch_create`
- `git_switch`
- `git_fetch`
- `git_pull`
- `git_push`

Il n'existe aucun outil de commande Git générique.

Les outils Git intégrés n'exposent pas reset, rebase, merge, stash, checkout arbitraire de fichiers, amend ni force push.

`git_pull` accepte uniquement les avances rapides (fast-forward).

## Outil web

Le contenu web distant peut être demandé par l'outil web dédié.

L'accès web n'utilise pas les règles de périmètre des ressources du système de fichiers local.

## MCP

Les serveurs MCP sont configurés par l'utilisateur et démarrés via stdio.

Chaque outil MCP possède sa propre identité stable :

`mcp__server__tool`

Les outils MCP participent indépendamment au système de permissions des outils.

## Modèle de permissions

Les permissions des outils et celles des ressources du système de fichiers sont distinctes.

### Politiques des outils

La politique d'un outil prend l'une des valeurs :

- `allow`
- `ask`
- `deny`

Un refus mémorisé empêche l'exécution.

### Durées de validité

Les décisions de permissions ont deux durées de validité :

- `currentSession`
- `allSessions`

Les décisions de la session courante restent uniquement en mémoire.

Les décisions d'outils valables pour toutes les sessions sont persistées dans les paramètres utilisateur de VS Code.

Les autorisations de ressources valables pour toutes les sessions sont persistées séparément dans l'état global de l'extension.

### Fenêtre VS Code courante

Les dossiers explicitement ouverts dans la fenêtre VS Code courante forment le périmètre implicite du système de fichiers.

### Espaces de travail structurels

L'extension détecte les limites structurelles des espaces de travail Cargo, pnpm et Node/npm/yarn.

Cette détection n'accorde jamais automatiquement l'accès.

Un espace de travail structurel détecté peut être explicitement autorisé pour un outil donné.

### Ressources externes

Une ressource du système de fichiers située hors de la fenêtre VS Code courante nécessite une autorisation explicite, sauf si le même outil possède déjà une autorisation mémorisée correspondante.

Les autorisations de ressources sont propres à chaque outil.

Une autorisation peut couvrir une ressource exacte, un répertoire ou un espace de travail structurel détecté.

### Résolution des permissions

L'autorisation est vérifiée avant l'accès ou l'effet demandé.

Une règle `deny` mémorisée l'emporte toujours.

Sinon, une décision de la session courante est plus spécifique qu'une décision valable pour toutes les sessions.

Un `ask` explicite nécessite toujours une confirmation, même lorsqu'une autorisation de ressource mémorisée existe.

Une autorisation mémorisée peut permettre à un contrôle ultérieur de réussir sans nouvelle boîte de dialogue, mais ne supprime jamais le contrôle lui-même. La révocation ou la modification d'une permission doit donc affecter immédiatement l'accès suivant.

L'égalité SHA, le contenu en cache, les nouvelles tentatives, les revérifications et les autres états techniques ne valent jamais autorisation.

### Ressources protégées

Les ressources protégées nécessitent toujours une nouvelle confirmation lorsque leur contenu est lu.

Les autorisations de ressources mémorisées ne contournent jamais cette règle.

Les ressources protégées comprennent les fichiers sensibles : fichiers d'environnement, clés, métadonnées Git, configuration SSH et fichiers d'identifiants.

Des motifs supplémentaires peuvent être configurés avec `bezotcorpAi.protectedPaths`.

La protection régit l'accès au contenu, jamais la visibilité.

Un fichier protégé peut rester visible comme entrée du système de fichiers. `list_files` peut exposer son existence et son chemin sans exposer son contenu. Le contexte du fichier actif et le pont peuvent également exposer le chemin tout en retenant le contenu.

Le système central de permissions porte la politique des ressources protégées. `read_file` l'applique en le consultant avant chaque acquisition effective de contenu depuis le système de fichiers.

Tout outil composé ayant besoin d'un contenu existant doit passer par `read_file` et hérite donc du même comportement de protection. `read_files`, `search_text`, `update_file` et les futurs outils composés ne doivent pas implémenter un autre chemin de lecture ni filtrer silencieusement les contenus protégés de leur propre initiative.

Les outils Git exposent l'état Git et ne filtrent jamais ce que Git retourne. Si un fichier sensible est versionné, il fait partie de l'état du dépôt et reste visible.

Les répertoires générés ou bruyants (`node_modules`, `target`, `dist`, `out`, `build`, `.git`...) peuvent être omis par défaut des listes et recherches larges pour des raisons d'ergonomie uniquement. Ce n'est pas une frontière de sécurité. Ils restent explicitement accessibles avec `includeIgnored: true`.

### Opérations critiques

Les écritures, déplacements, suppressions et créations critiques nécessitent une demande explicite d'accès critique par le modèle, une justification et une nouvelle confirmation utilisateur.

Les autorisations mémorisées ne contournent jamais cette confirmation.

### Effets refusés

Lorsque l'utilisateur refuse explicitement une opération, cet effet est mémorisé pour la génération courante.

Le modèle ne peut pas retenter le même effet par une autre voie pendant cette génération.

Fermer une boîte de dialogue sans refuser n'est pas considéré comme un refus.

## Modes d'autonomie

L'extension prend en charge :

- `readOnly`
- `confirm`
- `acceptEdits`
- `auto`

Les règles `deny` mémorisées s'appliquent toujours.

Les règles `ask` mémorisées nécessitent toujours une confirmation.

## Traduction de l'interface

L'interface est disponible en anglais et en français.

La langue affichée suit la langue d'affichage de VS Code.

Les identifiants du protocole destiné au modèle et les identités d'outils restent stables et ne sont pas traduits.

## Persistance

L'historique des conversations, les permissions persistées et l'état de récupération des opérations sur les fichiers sont stockés séparément selon leur fonction.

Les permissions de la session courante ne sont volontairement pas persistées.

## Limites actuelles de validation

Certains comportements d'exécution nécessitent encore une validation dans l'hôte de développement d'extensions de VS Code.

---

[← Retour au guide de développement (anglais)](../../FOR_DEVELOPERS.md)
