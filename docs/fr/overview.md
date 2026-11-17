# Architecture de BezotCorp AI — guide de lecture

> Ce document est une **vue d'ensemble en français**, pas une traduction intégrale de la [documentation technique anglaise](../en/architecture.md). La version anglaise reste la référence détaillée de l'état actuel de l'extension.

## L'extension VS Code

BezotCorp AI fonctionne dans VS Code avec une interface de conversation, des fournisseurs de modèles IA (notamment Ollama et un backend personnalisé), des outils de consultation et de modification de projets, un accès Git encadré et des outils MCP.

L'objectif est de permettre à une IA d'agir sur le projet **sans supprimer les frontières de sécurité ni contourner les autorisations de l'utilisateur**.

## Responsabilités fondamentales

- **Extension et interface :** gérer les conversations, les messages, les appels d'outils, l'arrêt d'une génération et l'affichage.
- **Fournisseurs IA :** communiquer avec les modèles et leurs services, sans confondre ce transport avec les permissions d'exécution d'outils.
- **Outils de fichiers :** chaque opération élémentaire possède une implémentation déterminée ; une opération composée passe par cette implémentation au lieu d'en recréer une autre.
- **Permissions :** une politique centrale décide des autorisations, des confirmations et des refus ; elle s'applique même lorsqu'une opération est issue d'un outil composé.
- **Persistance :** conversations, décisions d'autorisation et récupération des écritures ont des responsabilités distinctes.
- **Git :** opérations encadrées, sans shell arbitraire ni accès illimité à Git.

## Lecture et écriture des fichiers

Une lecture existante passe par `read_file` et son contrôle d'accès. `read_files`, `search_text` et les outils qui ont besoin du contenu d'un fichier doivent réutiliser cette lecture autorisée.

Avant une modification, l'extension vérifie que le contenu sur disque est toujours celui que l'IA a consulté. Les écritures disposent de mécanismes de sauvegarde, de contrôle d'intégrité et de récupération. Une vérification de fraîcheur ne donne jamais, à elle seule, un droit d'accès.

Les ressources sensibles nécessitent une nouvelle confirmation pour lire leur contenu, même si d'autres autorisations ont été mémorisées. Les fichiers peuvent rester visibles dans une liste sans que leur contenu soit lisible.

## Conversations et permissions

Les conversations peuvent être créées, renommées, archivées, restaurées, placées dans la corbeille et supprimées. Les appels d'outils et leurs résultats utiles sont conservés dans l'historique.

Les permissions distinguent les outils et les ressources, avec des règles `allow`, `ask` et `deny`. Le refus explicite d'une opération ne peut pas être contourné en empruntant un autre outil pendant la même génération. Les opérations critiques demandent toujours une confirmation appropriée.

## Indexation du Standardizer

Le système d'indexation du Standardizer est un sujet architectural distinct : son contrat est documenté dans [Guichet unique et index](indexing.md). Le [README du Standardizer](../../tools/rust/standardizer/README.md) décrit quant à lui l'implémentation Rust actuelle, qui doit être confrontée à ce contrat.

## Ce que cette page ne remplace pas

La version anglaise détaille notamment les outils Git exposés, les modes d'autonomie, les règles de protection des ressources, la gestion des chemins, les outils MCP et les limites de validation actuelles. Pour vérifier une fonctionnalité précise ou une règle de sécurité, consulter la [spécification technique complète](../en/architecture.md).
