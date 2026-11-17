# Documentation / Documentation

The project documentation is organized by language. **English** is the reference language for the technical implementation; French pages are available for reviewing and discussing the architecture. A French overview does not silently claim to translate a longer English specification.

La documentation est organisée par langue. **L'anglais** reste la référence pour les détails techniques existants ; des documents français permettent de comprendre et de valider les choix d'architecture. Un résumé français n'est pas présenté comme une traduction intégrale d'une spécification anglaise.

## English

- [Extension architecture](en/architecture.md) — detailed current architecture of BezotCorp AI.
- [Indexing and single entry point](en/indexing.md) — architecture contract for the index routing system (distinct from the current implementation).
- [Development TODO](en/todo.md) — outstanding work.
- [Persistent AI memory specification](en/memory_ai_system.md) — detailed specification.
- [Historical working point — 2026-10-29](en/history/working-point-2026-10-29.md) — dated snapshot, not the current state.
- [Standardizer implementation reference](../tools/rust/standardizer/README.md) — current Rust/index formats.

## Français

- [Vue d'ensemble de l'architecture](fr/overview.md) — guide de lecture en français ; le document anglais reste la description détaillée de l'extension.
- [Architecture du guichet unique et des index](fr/indexing.md) — contrat d'architecture détaillé, à confronter au code.
- Les documents TODO, mémoire persistante et historiques ne sont pas encore traduits : consulter les versions anglaises ci-dessus.

## Conventions

- Les fichiers de `docs/en/` sont rédigés en anglais ; ceux de `docs/fr/` en français.
- Les contrats d'architecture décrivent **ce qui est attendu**. Les README techniques décrivent **l'implémentation actuelle**. Les points d'étape datés restent des archives.
- Conserver les liens relatifs et ne pas créer de dossier du même nom qu'un fichier d'architecture au même niveau.
