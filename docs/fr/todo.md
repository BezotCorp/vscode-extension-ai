# BezotCorp AI — Travaux restants

[Documentation](../docs_index.md) · [English](../en/todo.md)

Ce document suit uniquement le travail encore ouvert.

## Validation en exécution

- Exécuter l'extension dans l'hôte de développement d'extensions de VS Code.
- Valider les historiques de conversation contenant des appels et résultats d'outils.
- Valider chaque boîte de dialogue de permissions et le gestionnaire de permissions.
- Valider le comportement des ressources protégées.
- Valider la confirmation des opérations critiques.
- Valider les outils de fichiers singuliers et pluriels.
- Valider les outils Git, notamment fetch, pull et push avec de véritables identifiants.
- Valider le cycle de vie MCP.
- Valider le rechargement des conversations.
- Valider l'archivage, la corbeille, la restauration, la suppression définitive et le vidage de la conversation active.
- Valider le comportement du système de fichiers dans un espace de travail à plusieurs racines.

## Validation des modifications de fichiers

- Valider `update_file` dans l'hôte de développement d'extensions.
- Valider la disponibilité de `node:sqlite` dans l'environnement d'exécution de VS Code.
- Provoquer et vérifier un conflit de contenu concurrent.
- Provoquer et vérifier la récupération d'une écriture interrompue.
- Provoquer et vérifier un échec de restauration de l'intégrité.

## Validation des plateformes

- Valider la gestion des chemins sous Windows.
- Valider le comportement de Git sous Windows.
- Valider la gestion des lettres de lecteur et des motifs glob sous Windows.

## Types d'espaces de travail non pris en charge

- Ajouter la prise en charge des espaces de travail distants.
- Ajouter la prise en charge des espaces de travail virtuels.

## Backend personnalisé

- Ajouter la prise en charge des outils au fournisseur de backend personnalisé.

## Architecture de persistance

- Introduire un domaine de persistance explicite pour l'état durable de l'application.
- Séparer la logique métier des conversations des préoccupations de persistance, notamment `chat.json`, les versions de format, les migrations, les écritures atomiques et les sauvegardes des données illisibles.
- Examiner la persistance des permissions et séparer les règles des mécanismes de stockage VS Code lorsque c'est pertinent.
- Examiner la responsabilité des politiques de persistance, notamment les limites de compactage des résultats d'outils stockés.
- Garder les modèles métier indépendants des mécanismes de persistance lorsque c'est possible.

## Mémoire persistante

Référence : [memory_ai_system.md](memory_ai_system.md).

- Implémenter le sous-système de mémoire persistante en Rust.
- Implémenter l'exécutable du moteur de stockage.
- Implémenter l'exécutable du moteur de consolidation symbolique.
- Implémenter l'exécutable du moteur symbolique de préparation du contexte.
- Implémenter le stockage durable avec identités, ordre temporel et provenance.
- Implémenter les branches et révisions de conversations.
- Implémenter les niveaux de mémoire Restreinte, Étendue, Avancée et Universelle.
- Implémenter la consolidation symbolique incrémentale en préservant les originaux conservés.
- Implémenter la préparation symbolique du contexte, la recherche et la réinjection.
- Intégrer la capture mémorielle aux conversations, outils, MCP et permissions.
- Implémenter les mécanismes de budget disque et de rétention.
- Implémenter la consultation et la configuration de la mémoire dans VS Code.

---

[← Retour au guide de développement (anglais)](../../FOR_DEVELOPERS.md)
