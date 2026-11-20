# Architecture — Guichet unique des index

[Documentation](../docs_index.md) · [English](../en/indexing.md)

> **Statut : contrat d'architecture.** Ce document fixe les responsabilités et les invariants attendus, indépendamment de l'état du code Rust. Il ne décrit pas automatiquement chaque comportement de l'implémentation actuelle.
>
> **Analogie France Travail :** le guichet reçoit une demande, identifie tous les services compétents et les oriente. Il ne devient ni le service spécialisé, ni les archives, ni l'agent qui réalise chacune des opérations.

## 1. Objectif

Retrouver les données pertinentes **sans ouvrir inutilement d'autres index ou d'autres stockages**, qu'ils soient locaux ou distants. Le routage doit rester extensible : ajouter un domaine, un type d'index, une catégorie ou un emplacement n'impose pas de coder de nouvelles branches métier dans le guichet.

Le principe est le suivant :

```text
Demande
  → traitement de la requête
    → GlobalIndex (guichet : sélectionner tous les index pertinents)
      → index sélectionnés (exécuter leur propre recherche)
        → données persistées, uniquement si nécessaires
```

Le sens d'une **recherche** est du haut vers les index concernés puis les données. La **maintenance des métadonnées** pendant une création ou une modification est un autre processus ; elle peut propager des changements entre les niveaux, sans imposer un parcours inverse lors des recherches.

## 2. Responsabilités, sans confusion

| Responsabilité                       | Contrat                                                                                                                                                                                                                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Réception / traitement d'une requête | Comprendre la demande, solliciter le guichet, exploiter les index retournés et réunir les résultats sans doublons. Ne pas supposer à l'avance qu'un seul index est « le bon ».                                                                                                                 |
| `GlobalIndex` — guichet unique       | Référencer **tous** les index existants, physiques et catégoriels ; connaître leur identité, leur emplacement et les métadonnées nécessaires pour déterminer s'ils peuvent répondre. Retourner **toutes** les correspondances pertinentes, sans réaliser lui-même les recherches spécialisées. |
| Index catégoriels                    | Répondre à une forme de recherche précise : identité UUID, références inverses, tags ou autre capacité déclarée. Ils peuvent être partitionnés.                                                                                                                                                |
| Index physiques intermédiaires       | Référencer les index enfants et leurs informations de sélection pour éviter d'ouvrir les branches non pertinentes.                                                                                                                                                                             |
| Index physiques terminaux            | Référencer les enregistrements physiquement stockés, avec les métadonnées permettant de choisir les fichiers à ouvrir.                                                                                                                                                                         |
| Coordination des écritures           | Mettre à jour les données, les index concernés et leurs métadonnées de sélection de façon cohérente.                                                                                                                                                                                           |
| Stockage                             | Lire et écrire à un emplacement donné ; ne pas décider quelle stratégie de recherche utiliser.                                                                                                                                                                                                 |
| Contrôle de cohérence / récupération | Vérifier et réparer selon des mécanismes explicitement définis, sans transformer toute recherche en scan exhaustif.                                                                                                                                                                            |

Une structure Rust peut évoluer pour porter l'une de ces responsabilités, mais un nom existant (`DataPlacementOrchestrator`, `IndexOrchestrator`, etc.) ne fait **pas** autorité sur ce contrat. On doit vérifier ses appels et ses effets réels avant de la renommer ou de la déplacer.

## 3. Identité, emplacement, critères et tags

- Chaque index possède un **`IndexId` stable et propre**, indépendant de sa `Location`. Changer l'emplacement ne change pas l'identité.
- `Location` indique où et par quel stockage accéder à l'index ; elle ne constitue ni son identité, ni son comportement.
- Les **critères / mots-clés** décrivent les recherches auxquelles un index sait répondre : par exemple `node`, `uuid`, `edge`, `reference`, `physical`, ou une coordonnée de partition.
- Les **tags des données** décrivent réellement les enregistrements (`node`, `edge`, `rust`, `pending`, etc.). **Un critère n'est pas un tag métier** même lorsque leurs libellés sont identiques.
- Les références d'index aux niveaux où une décision de sélection est prise doivent conserver **les métadonnées utiles à cette décision**, notamment l'agrégat des tags couverts lorsqu'une recherche filtre par tags. Cette information doit être disponible **avant d'ouvrir** l'index référencé.

Le guichet doit pouvoir écarter un index qui ne peut pas contenir de résultat demandé, et conserver tous ceux qui pourraient en contenir. Un filtre est autorisé à garder trop de candidats, **jamais à perdre un candidat valide**. Les critères expriment une capacité, les tags agrégés une présence possible : leur rôle est complémentaire.

### Exemples de sélection

- `node` : tous les index compatibles avec cette recherche, sans choisir arbitrairement une seule hiérarchie.
- `node + uuid` : les index catégoriels compatibles avec la recherche d'identités de nodes.
- `edge + node` : les index compatibles avec la recherche d'edges à partir d'un node.
- Tags `node` et/ou `rust` : ne consulter que les index dont la couverture annoncée peut apporter des résultats. La sémantique exacte d'une combinaison de tags (tous / au moins un) appartient à la requête, pas à une hypothèse du guichet.
- `pending` : pouvoir identifier les mutations en attente au moyen des index et de leurs métadonnées, **sans scanner les données persistées**.

Plus on fournit de critères discriminants, plus la sélection se resserre. Si plusieurs index restent compatibles, le guichet les retourne tous. L'exécution doit gérer les éventuels recouvrements.

## 4. Index catégoriels et index physiques sont complémentaires

Les index catégoriels ne sont pas des copies décoratives des index physiques.

- **Par UUID :** l'index adapté indique directement où trouver l'enregistrement.
- **Par référence inverse :** retrouver les edges associés à un node via l'index dédié, **sans parcourir les edges**.
- **Par tags :** la sélection doit éliminer au plus tôt les index et branches sans correspondance ; un index catégoriel inversé par tags peut offrir un accès plus direct, sans retirer aux index physiques leurs propres métadonnées.
- **Par emplacement physique :** les index intermédiaires permettent de naviguer dans les partitions ; les terminaux répertorient les fichiers réels.

Aucun index catégoriel ne doit devenir un fichier mondial unique : son partitionnement doit pouvoir suivre le volume et les contraintes de stockage. Le choix exact de l'index utilisé dépend des capacités réellement déclarées, pas d'un nom de domaine codé en dur.

## 5. Agrégations et suppressions : invariant essentiel

Un agrégat de tags sur une référence à un index signifie : « **au moins un enregistrement couvert** porte ce tag ».

Il ne signifie **pas** « tous les enregistrements le portent ».

Pour un index terminal, les tags des fichiers référencés sont la source permettant de déterminer sa couverture. Pour un intermédiaire, les couvertures de ses enfants permettent de déterminer la sienne. Les références utilisées pour orienter une recherche doivent refléter les couvertures effectives, jusqu'aux métadonnées de sélection du guichet lorsqu'elles sont nécessaires.

**Supprimer un tag ne consiste jamais à effacer aveuglément ce tag de tous les agrégats.** Il faut le conserver tant qu'un autre enregistrement couvert le porte. Inversement, dès que plus aucun enregistrement couvert ne le porte, l'agrégat doit disparaître des références concernées. Ceci s'applique aux index physiques et aux capacités catégorielles maintenues.

L'actualisation se fait **pendant l'opération d'écriture / de mutation**, avec une cohérence transactionnelle et une stratégie de récupération. Une recherche ultérieure exploite les métadonnées déjà établies ; elle n'a pas à reconstruire l'agrégat en explorant les index inférieurs.

## 6. Modèle de données et propagation

- **Node :** porte ses propres tags.
- **Edge :** relation neutre entre **N nodes**, sans imposer source / cible. Ses tags sont `edge` **plus l'union des tags non structurels** des nodes liés.
- **Tags structurels :** `node`, `edge`, `interpretation`, `mutation` et autres tags déclarés comme structurels ne se propagent jamais entre domaines.
- **Interpretation :** objet distinct qui conserve un sens ou un contexte durable lié à la lecture d'un edge. **Ne pas effacer une information sémantique au motif qu'elle semble aujourd'hui déductible des nodes** ; les choix précis de modélisation restent à spécifier.
- **Mutation :** intention persistée, identifiée (UUIDv7), indexée et partitionnable. Son état `pending` permet de retrouver le travail non terminé après interruption ; `done` indique son achèvement.

### Exemple : retirer `rust` d'un node

1. Persister l'intention de mutation `pending`.
2. Modifier les tags du node et mettre à jour ses index.
3. Interroger l'index catégoriel de références inverses pour retrouver **uniquement** les edges liés au node.
4. Pour chaque edge concerné, recalculer l'union des tags non structurels de **tous** ses nodes. Si un autre node porte encore `rust`, l'edge conserve `rust`.
5. Mettre à jour les index et leurs métadonnées de sélection ; ne supprimer `rust` d'un agrégat que s'il n'est plus représenté.
6. Marquer la mutation `done` seulement lorsque l'opération a atteint son état cohérent.

Une reprise doit être **idempotente**. Elle ne doit pas exiger que l'intégralité des index soit d'abord parfaitement cohérente, si l'objectif est justement de réparer une interruption.

## 7. Local, distant, partitionnement, robustesse

Le routage doit identifier les candidats **avant** toute ouverture distante inutile. Les partitions doivent être compatibles avec les index physiques **et** catégoriels. Ni l'identité des index, ni la requête, ni les règles de propagation ne doivent dépendre exclusivement de chemins locaux.

Une garantie de transaction ne se déduit pas d'un rollback en mémoire : distinguer erreur récupérable, arrêt brutal du processus et écritures concurrentes. La reprise doit protéger aussi la cohérence entre enregistrements, index catégoriels, index physiques et guichet. La validation de cohérence peut être explicite ou progressive ; elle ne doit pas imposer par défaut l'ouverture de tous les index à chaque chargement ordinaire.

## 8. Critères d'acceptation pour toute modification

1. Une requête sélectionne les candidats depuis le guichet **sans ouvrir préalablement tous les index**.
2. Tous les index compatibles sont accessibles ; aucun résultat valide n'est perdu, même avec partitionnement ou recouvrement.
3. UUID, référence inverse et tags empruntent des chemins adaptés à leur forme de recherche, sans scan des données lorsque des index spécialisés existent.
4. Ajouter, retirer ou déplacer une donnée maintient correctement les références et les agrégats ; **suppression du dernier porteur** et **suppression d'un porteur parmi plusieurs** sont couvertes.
5. L'opération node → edges utilise les références inverses et préserve les tags encore présents sur d'autres nodes.
6. Les informations des interpretations restent durables et ne sont pas éliminées implicitement lors d'une migration.
7. Une mutation interrompue est retrouvable et reprenable ; les cas d'échec partiel font l'objet de tests automatisés conservés.
8. Les migrations préservent les données existantes et vérifient leurs invariants avant et après, sans écriture non nécessaire.

## 9. Rapport à l'implémentation actuelle

Ce contrat **ne valide pas automatiquement** les classes existantes. Dans `standardizer`, `GlobalIndex` référence actuellement identités, locations et critères ; `DataPlacementOrchestrator` relie les domaines aux lieux de vie des données (état résident, rendu, cohérence RAM/disque) et délègue le support local à `StorageManager` ; `GraphReader` porte les parcours et la vérification du graphe ; `IndexOrchestrator` coordonne des modifications d'index ; `IdIndex` et `ReferenceIndex` existent ; la recherche par tags passe aujourd'hui par la hiérarchie physique.

Ces constats servent à **auditer les écarts**, non à imposer un renommage ou une réécriture générale. Toute remise en conformité doit commencer par des tests de comportement et préserver les données RON ; un changement de format exige une migration vérifiée.

## 10. Initialisation et témoin `.lock`

Distinguer ce que fait réellement le code : **seules** les commandes explicites `init` et `adopt` amènent un système à l'état initialisé. Les créations d'index à la demande (nouveaux index, nouvelles partitions) sont des **extensions** d'un système déjà initialisé, pas une initialisation.

- **Témoin :** `data/standardizer/.lock`, fichier vide, créé une seule fois, **en dernier**, après qu'un système complet se charge et se vérifie. Jamais modifié, remplacé ni supprimé en fonctionnement normal ; ce n'est pas un verrou de concurrence et il n'est pas stocké dans `global_index.ron`.
- **État du dossier** (`InitializationState`) : `Virgin` (dossier absent ou vide), `Initialized` (`.lock` et `global_index.ron`), `AdoptionPending` (`global_index.ron` présent sans `.lock`), `Anomaly` sinon : `.lock` présent sans `global_index.ron`, ou données sans aucun des deux fichiers.
- **L'absence de `.lock` ne suffit jamais à initialiser.** `init` exige `Virgin`, c'est-à-dire un emplacement réellement vierge. `adopt` exige `AdoptionPending`. Toute autre situation est refusée avec la raison.
- **`init <dossier> <tag_registry.ron> <write_locations.ron>`** crée un système vide (global vide) à partir des deux fichiers fournis ; en cas d'échec avant `.lock`, seuls les fichiers créés par cet appel sont retirés.
- **`adopt`** vérifie l'état existant (chargement complet), puis crée `.lock` : aucun index recréé, aucun UUID modifié, aucun enregistrement réécrit.
- **Fonctionnement normal :** un index enregistré dont le fichier manque est une **erreur**. Un fichier d'index présent mais absent du `GlobalIndex` n'est **jamais recréé**. Un système sans `.lock` (adoption en attente) reste lisible mais **les écritures sont refusées**.
- **Limites :** le système ne dépend ni de Git ni du réseau : l'état se déduit des seuls fichiers du dossier. Un `.lock` supprimé alors que `global_index.ron` subsiste est donc indiscernable d'un système à adopter ; un dossier entièrement vidé est indiscernable d'un emplacement vierge. Le versionnement du `.lock` est une opération Git ordinaire, laissée à l'utilisateur.

Référence complémentaire : [README du Standardizer](../../tools/rust/standardizer/README.md), qui décrit les formats et le fonctionnement actuel.
