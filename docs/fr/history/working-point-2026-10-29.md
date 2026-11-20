# BezotCorp AI — Point d'étape

[Documentation](../../docs_index.md) · [English](../../en/history/working-point-2026-10-29.md)

**Date :** 2026-10-29
**Périmètre :** code source implémenté à cette date.

Ce document consigne l'implémentation effectivement présente dans le dépôt. Il ne contient ni travaux futurs, ni propositions, ni priorités de développement.

## Extension VS Code

| Composant                 | Fonctionnalité implémentée                                  | Source                                 |
| ------------------------- | ----------------------------------------------------------- | -------------------------------------- |
| Activation de l'extension | Cycle de vie et enregistrement des commandes                | `src/extension.ts`                     |
| Interface de conversation | Intégration de la webview VS Code                           | `src/webview/chat_view_provider.ts`    |
| Contrôleur de génération  | Génération des conversations et gestion des interruptions   | `src/webview/generation_controller.ts` |
| Configuration             | Paramètres des fournisseurs, modèles, contexte et extension | `src/config/extension_config.ts`       |
| Pont local                | Intégration HTTP avec certaines capacités de VS Code        | `src/server/`                          |

## Conversations

L'extension implémente les sessions et les messages, notamment la création, la sélection, le renommage, la suppression et le stockage persistant des sessions.

| Composant             | Implémentation                                                      |
| --------------------- | ------------------------------------------------------------------- |
| Stockage des sessions | Persistance JSON dans `chat.json`                                   |
| Gestion des sessions  | Conversations multiples et changement de session                    |
| Messages              | Messages utilisateur et assistant                                   |
| Génération            | Affichage progressif et annulation                                  |
| Persistance           | Sérialisation JSON complète et écritures sur le système de fichiers |

Le code de persistance existant gère les échecs d'écriture en les journalisant en interne.

## Fournisseurs IA

| Fournisseur          | Fonctionnalité implémentée                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------- |
| Ollama               | Génération de conversations, streaming, découverte de modèles, vérification des connexions et appels d'outils |
| Backend personnalisé | Communication HTTP, contrôles de disponibilité et réponses JSON aux conversations                             |

Le dépôt contient une abstraction des fournisseurs, une fabrique de fournisseurs et des fonctions de gestion des modèles.

Le fournisseur Ollama implémente les appels d'outils dans l'interaction actuelle avec le modèle. La construction de sa requête initialise la conversation envoyée au modèle avec un message système et le message utilisateur courant.

## Contexte de l'espace de travail

Le constructeur de contexte collecte des informations depuis l'espace de travail VS Code.

| Source             | Fonctionnalité implémentée                   |
| ------------------ | -------------------------------------------- |
| Texte sélectionné  | Récupération de la sélection dans l'éditeur  |
| Document actif     | Inclusion du contexte du fichier actif       |
| Documents ouverts  | Inclusion du contexte des fichiers ouverts   |
| Espace de travail  | Informations sur les fichiers et répertoires |
| Modes de contexte  | Modes simple et enrichi                      |
| Aperçu du contexte | Affichage du contexte collecté avant envoi   |

Le code implémente également des limites de contenu et la résolution des chemins de l'espace de travail.

## Outils intégrés

Onze outils intégrés sont enregistrés par `src/tools/default_tools.ts`.

| Outil               | Opération                                     |
| ------------------- | --------------------------------------------- |
| `ReadFileTool`      | Lire le contenu d'un fichier                  |
| `ListFilesTool`     | Lister les entrées du système de fichiers     |
| `SearchTextTool`    | Chercher dans le contenu des fichiers         |
| `SelectedTextTool`  | Lire le texte sélectionné dans l'éditeur      |
| `WorkspaceTreeTool` | Récupérer la structure de l'espace de travail |
| `CreateFileTool`    | Créer un fichier                              |
| `WriteFileTool`     | Écrire un fichier                             |
| `DeleteFileTool`    | Supprimer un fichier                          |
| `MoveFileTool`      | Déplacer un fichier                           |
| `RunCommandTool`    | Exécuter une commande                         |
| `WebFetchTool`      | Récupérer du contenu distant                  |

L'infrastructure d'outils comprend l'enregistrement, les définitions, la validation des entrées, les contextes d'exécution, les résultats d'exécution, les gardes d'accès et la boucle d'exécution des outils.

### Interaction entre modèle et outils

L'interaction Ollama implémentée suit cette séquence :

1. Envoyer la requête courante au modèle.
2. Recevoir une réponse contenant des appels d'outils.
3. Résoudre les outils correspondants.
4. Vérifier leurs permissions d'exécution.
5. Exécuter les outils autorisés.
6. Retourner les résultats au modèle.
7. Poursuivre la génération de la réponse.

L'implémentation comporte des limites d'exécution explicites pour le traitement des appels d'outils.

## Intégration MCP

| Composant                  | Implémentation                         | Source                         |
| -------------------------- | -------------------------------------- | ------------------------------ |
| Configuration des serveurs | Paramètres des serveurs MCP            | `src/mcp/mcp_server_config.ts` |
| Client MCP                 | Communication avec les serveurs MCP    | `src/mcp/mcp_client.ts`        |
| Gestionnaire MCP           | Gestion des serveurs et clients        | `src/mcp/mcp_manager.ts`       |
| Outils MCP                 | Représentation et exécution des outils | `src/mcp/mcp_tool.ts`          |
| Informations des outils    | Métadonnées des outils MCP             | `src/mcp/mcp_tool_info.ts`     |

Les outils MCP sont intégrés à l'infrastructure d'outils existante de l'extension.

## Permissions

L'extension implémente trois modes d'autonomie.

| Mode          | Identifiant |
| ------------- | ----------- |
| Lecture seule | `readOnly`  |
| Confirmation  | `confirm`   |
| Automatique   | `auto`      |

L'implémentation comprend les demandes et décisions de permissions, les capacités, les portées, les autorisations, leur persistance, la couverture des portées et la gestion des permissions.

Le garde d'accès des outils relie ces permissions à leur exécution.

## Gestion des correctifs

Le dépôt implémente la détection, l'aperçu, l'affichage des différences, l'acceptation, le rejet et l'application des correctifs via les modifications d'espace de travail VS Code.

## Documentation et livraison

| Fichier                         | Contenu existant                                   |
| ------------------------------- | -------------------------------------------------- |
| `README.md`                     | Présentation et utilisation de l'extension         |
| `CHANGELOG.md`                  | Historique des changements publiés                 |
| `docs/memory_ai_system.md`      | Spécification de la mémoire persistante            |
| `.github/workflows/release.yml` | Workflow de publication GitHub Actions             |
| `.releaserc.json`               | Configuration de semantic-release                  |
| `package.json`                  | Métadonnées, scripts et dépendances de l'extension |
| `pnpm-lock.yaml`                | Verrouillage des dépendances                       |

## Référence d'implémentation

Ce document consigne les fonctionnalités implémentées dans le code source exporté le 2026-10-29. Il ne revendique aucune validation en exécution ni compilation réussie qui n'aurait pas été consignée lors de cette revue.
