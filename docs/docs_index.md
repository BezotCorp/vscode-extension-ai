# Documentation / Documentation

This index is the entry point for the project documentation, available in English and French. Each page has a counterpart at the same path under `en/` or `fr/`, with links to switch languages. Both versions carry the same requirements and scope; an overview is separate from the detailed architecture.

Cet index est le point d'entrée de la documentation du projet, disponible en anglais et en français. Chaque page possède un équivalent au même chemin sous `en/` ou `fr/`, avec des liens pour changer de langue. Les deux versions portent les mêmes exigences et le même périmètre ; la vue d'ensemble est distincte de l'architecture détaillée.

| Topic / Sujet                                                             | English                                                 | Français                                                |
| ------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| Reading guide / Guide de lecture                                          | [Overview](en/overview.md)                              | [Vue d'ensemble](fr/overview.md)                        |
| Current extension architecture / Architecture actuelle de l'extension     | [Architecture](en/architecture.md)                      | [Architecture](fr/architecture.md)                      |
| Index architecture contract / Contrat d'architecture des index            | [Index architecture](en/indexing.md)                    | [Architecture des index](fr/indexing.md)                |
| Outstanding work / Travaux restants                                       | [TODO](en/todo.md)                                      | [Travaux restants](fr/todo.md)                          |
| Persistent memory specification / Spécification de la mémoire persistante | [Memory system](en/memory_ai_system.md)                 | [Système de mémoire](fr/memory_ai_system.md)            |
| Historical snapshot / Instantané historique — 2026-10-29                  | [Working point](en/history/working-point-2026-10-29.md) | [Point d'étape](fr/history/working-point-2026-10-29.md) |

## Scope and maintenance / Périmètre et maintenance

- `en/` contains English pages; `fr/` contains French pages. Keep matching paths and update both versions together when changing content. Preserve technical identifiers, commands and code paths.
- The architecture describes the documented implementation. Architecture contracts and specifications describe expected behavior. Dated snapshots remain historical, including their original paths and feature lists; they do not certify the current implementation.
- Technical documentation under `tools/` remains in English and is maintained with the corresponding tool. The [Standardizer README](../tools/rust/standardizer/README.md) describes its Rust implementation and RON formats; the index contract above describes the intended architecture.
- The root [README](../README.md) and [developer guide](../FOR_DEVELOPERS.md) remain in English and link to this index.

- `en/` contient les pages anglaises ; `fr/` contient les pages françaises. Conserver des chemins correspondants et mettre à jour les deux versions ensemble lors d'un changement de contenu. Préserver les identifiants techniques, commandes et chemins du code.
- L'architecture décrit l'implémentation documentée. Les contrats d'architecture et spécifications décrivent le comportement attendu. Les instantanés datés restent historiques, y compris leurs chemins et listes de fonctionnalités d'origine ; ils ne certifient pas l'implémentation actuelle.
- La documentation technique sous `tools/` reste en anglais et est maintenue avec l'outil correspondant. Le [README du Standardizer](../tools/rust/standardizer/README.md) décrit son implémentation Rust et ses formats RON ; le contrat d'indexation ci-dessus décrit l'architecture attendue.
- Le [README](../README.md) racine et le [guide de développement](../FOR_DEVELOPERS.md) restent en anglais et pointent vers cet index.
