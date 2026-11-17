# BezotCorp AI — Spécification générale du système de mémoire persistante, structurée et évolutive

## Objet du document

Ce document constitue la spécification de référence pour l'implémentation d'un système de mémoire persistante au sein de l'extension VS Code **BezotCorp AI**.

L'objectif est de créer une mémoire capable de conserver, structurer, enrichir, retrouver et réinjecter les informations issues des interactions entre un développeur, une IA et ses outils.

La conception doit concilier cinq exigences :

1. Une **traçabilité rigoureuse** des données et de leurs relations.
2. Une **mémoire enrichissable**, sans falsification des données originelles conservées.
3. Une **consommation disque maîtrisée**, configurable et transparente.
4. Une **exploitation immédiate en cours de conversation**, sans attendre la fin d'une session.
5. Une architecture suffisamment évolutive pour accueillir ultérieurement des moteurs d'analyse spécialisés, notamment neurosymboliques.

La mémoire doit devenir une infrastructure de connaissance fiable, sans transformer l'extension VS Code en une architecture distribuée inutilement complexe.

### Périmètre immédiat

Le travail concerne l'extension existante et son évolution cohérente.

Il comprend :

- L'intégration de la mémoire dans l'extension.
- La persistance durable.
- Les objets métier et leurs relations.
- Les branches et révisions.
- Les quatre niveaux de mémoire.
- La consolidation incrémentale.
- Le rappel contextuel.
- L'intégration aux outils locaux et MCP.
- Le contrôle des ressources disque.
- Les interfaces de consultation et de configuration.

Il ne comprend pas :

- La création d'une application externe `memory_ai`.
- L'installation de services `systemd`.
- La création d'un superviseur.
- L'exécution de traitements après fermeture complète de VS Code.
- Le développement immédiat d'une IA neurosymbolique.
- L'introduction obligatoire d'une seconde IA.

Ces possibilités peuvent être étudiées ultérieurement sans constituer des prérequis.

---

## 1. Principes architecturaux impératifs

### 1.1. Identité des objets

Tous les nouveaux objets métier persistants doivent posséder un identifiant unique de type **UUIDv7**.

Cela concerne notamment :

- Les sessions.
- Les branches.
- Les messages.
- Les demandes et étapes de travail de l'IA, lorsqu'elles correspondent à des objets distincts.
- Les appels d'outils.
- Les résultats d'outils.
- Les décisions d'autorisation lorsqu'elles sont conservées.
- Les révisions.
- Les enrichissements.
- Les connaissances consolidées.
- Les chemins de travail.
- Les relations persistantes lorsqu'elles portent elles-mêmes des attributs métier ou une identité propre.
- Les demandes différées de changement de configuration.

Les UUIDv7 constituent les identités métier.

Les empreintes cryptographiques utilisées pour la déduplication des contenus ne les remplacent jamais.

Un objet ne doit pas recevoir plusieurs identifiants inutiles pour représenter la même identité.

### 1.2. Relations explicites

Tout objet doit pouvoir référencer les objets dont il dépend.

Les relations doivent permettre de remonter une chaîne de provenance et de retrouver ses conséquences.

Exemple conceptuel :

```text
Demande utilisateur U1
  |
  +-- Travail IA A1
       |
       +-- Appel d'outil T1 : read_file
       |    +-- Résultat R1
       |
       +-- Appel d'outil T2 : read_web
       |    +-- Résultat R2
       |
       +-- Appel d'outil T3 : read_api_meteo
       |    +-- Résultat R3
       |
       +-- Réponse finale M1
```

Les appels T1, T2 et T3 possèdent trois UUIDv7 distincts.

Le résultat R2 référence explicitement T2, pas simplement « le dernier outil appelé ».

Une même demande peut déclencher plusieurs outils, plusieurs étapes de raisonnement ou plusieurs réponses.

Il ne faut pas imposer une structure artificiellement linéaire lorsque les relations réelles sont multiples.

Une relation causale ne doit jamais être inventée pour combler une donnée manquante.

### 1.3. Temporalité

La mémoire ne doit pas se limiter à conserver des dates.

Elle doit permettre de retrouver :

- La date de création d'un objet.
- L'ordre réel des opérations.
- La succession des messages.
- L'appartenance à une session.
- Le parcours d'une branche.
- Les relations entre versions.
- Le moment où une observation a été obtenue.
- Le moment où un enrichissement a été créé.
- Le moment où une connaissance a été corrigée ou invalidée.

L'ordre doit être déterministe.

Un horodatage seul ne suffit pas nécessairement, notamment pour plusieurs opérations effectuées presque simultanément.

Utiliser une représentation d'ordre adaptée au stockage et à TypeScript, sans confondre ordre chronologique et causalité.

### 1.4. Nature des objets

Ne pas imposer un modèle événementiel artificiel.

Une session est un objet conteneur.

Un message est un objet représentant un message.

Un appel d'outil représente l'appel réel d'un outil.

Un résultat d'outil représente son résultat réel.

Un enrichissement représente une connaissance ou une annotation ajoutée.

Un journal chronologique est autorisé lorsqu'il apporte une valeur technique.

En revanche, il ne doit pas provoquer une duplication systématique de chaque objet sous forme d'un second objet événementiel artificiel.

La priorité est de conserver les objets réels, leurs identités, leur ordre et leurs relations.

### 1.5. Typage et validation

Utiliser des types TypeScript explicites.

Les catégories fermées doivent être représentées par des unions discriminées ou des mécanismes équivalents.

Un message possède obligatoirement un auteur.

Ne pas déduire l'auteur de sa position dans la conversation.

Deux messages utilisateur peuvent se suivre.

Une réponse de l'IA peut être interrompue ou ne jamais être produite.

Les objets persistants doivent être validés lors de leur lecture.

Aucune donnée externe ou ancienne ne doit être considérée comme structurellement valide sans vérification.

---

## 2. Sessions, messages, branches et révisions

### 2.1. Session comme racine

La session constitue la racine de l'historique conversationnel.

Ne pas imposer une hiérarchie de projets au-dessus des sessions.

Une même session peut traiter plusieurs projets, plusieurs répertoires, plusieurs fichiers et plusieurs domaines.

La mémoire ne doit donc pas supposer qu'une session appartient obligatoirement à un projet unique.

### 2.2. Messages

Un message doit conserver, selon le niveau de mémoire :

- Son UUIDv7.
- Son auteur.
- Son contenu originel.
- Sa temporalité.
- Son appartenance à une session.
- Ses liens avec les branches concernées.
- Ses relations avec les demandes, outils et réponses associées.
- Son éventuel état d'interruption ou d'inachèvement.

Un message conservé ne doit pas être silencieusement réécrit par un enrichissement.

### 2.3. Branches

Les branches permettent plusieurs parcours conversationnels dans une même session.

Exemple :

```text
Message M1
   |
Message M2
   |
   +------ Branche B1
   |         |
   |         M3
   |         |
   |         M4
   |
   +------ Branche B2
             |
             M5
             |
             M6
```

Les objets communs ne doivent pas être copiés inutilement.

Une branche possède son propre UUIDv7 et référence les objets composant son parcours.

L'ordre des messages dans chaque branche doit rester déterministe.

Les branches anciennes peuvent être conservées ou supprimées selon le niveau mémoriel.

Une branche supprimée ne doit jamais être présentée comme récupérable lorsqu'elle ne l'est plus.

### 2.4. Révisions

Modifier un ancien message ne doit pas altérer silencieusement la version conservée.

Une révision doit disposer d'une identité et de relations explicites avec sa version précédente.

Lorsqu'une modification crée un nouveau parcours conversationnel, celui-ci est représenté par une branche.

Les contenus partagés doivent être mutualisés physiquement lorsque cela est avantageux.

### 2.5. Interruption

Une interaction peut être interrompue à n'importe quel moment :

- Avant un appel d'outil.
- Pendant un appel.
- Après un résultat.
- Pendant une génération.
- Avant la réponse finale.

Le système doit conserver les opérations réellement effectuées dans les limites du niveau choisi.

Il ne doit jamais inventer une réponse finale ou un résultat d'outil pour compléter artificiellement l'historique.

---

## 3. Mémoire originelle et mémoire enrichie

### 3.1. Mémoire originelle

La mémoire originelle correspond au vécu enregistré par l'IA.

Elle peut contenir :

- Les messages.
- Les demandes de l'IA.
- Les appels d'outils.
- Les résultats.
- Les décisions d'autorisation.
- Les contenus observés.
- Les branches.
- Les versions.
- Les relations et leur temporalité.

Le niveau mémoriel détermine combien de ces informations sont conservées durablement.

**Un original encore conservé reste intact.**

Une politique de rétention peut autoriser sa suppression, mais pas sa falsification.

### 3.2. Mémoire enrichie

L'enrichissement consiste à produire des objets supplémentaires reliés aux objets originaux.

Exemple :

```text
Message M1
  contenu : "Bonjour Rémi, comment tu vas aujourd'hui ?"

Enrichissement E1
  source : M1
  émotion supposée : joyeux
  intention : salutation
```

L'enrichissement ne remplace jamais le contenu de M1.

Au rappel, le système peut composer :

```text
Message original M1
+
Enrichissement E1
```

Il ne doit pas transformer le message original pour y incorporer l'interprétation.

Ainsi, une réinjection ne doit pas transformer une salutation originale en une autre formulation simplement parce qu'un moteur de consolidation l'a réinterprétée.

### 3.3. Enrichissements possibles

Le système doit pouvoir accueillir des enrichissements de natures diverses :

- Tags.
- Catégories.
- Intentions.
- Émotions supposées.
- Préférences exprimées.
- Contraintes de développement.
- Décisions.
- Faits observés.
- Hypothèses.
- Corrections.
- Contradictions.
- Relations entre connaissances.
- Règles générales.
- Invariants transversaux.
- Indications de validité temporelle.
- Provenance.
- Niveau de confiance ou statut de vérification.

La structure doit rester extensible sans imposer tous ces enrichissements à chaque message.

### 3.4. Provenance et incertitude

Une interprétation n'est pas une observation certaine.

Exemple :

```text
Émotion supposée : joyeux
```

ne doit pas être confondu avec :

```text
Émotion explicitement déclarée : joyeux
```

La mémoire doit distinguer :

- Ce que l'utilisateur a explicitement déclaré.
- Ce que l'outil a réellement observé.
- Ce que l'IA a déduit.
- Ce qui a été confirmé.
- Ce qui reste hypothétique.
- Ce qui a été corrigé ou invalidé.

Une information issue d'une ancienne branche doit également conserver son contexte historique.

### 3.5. Évolution des enrichissements

Un enrichissement peut être complété, corrigé, contredit ou invalidé.

Cette évolution doit être traçable.

Les nouvelles versions ou corrections doivent avoir leurs identités et relations propres lorsque nécessaires.

La donnée originelle n'est jamais modifiée pour refléter une nouvelle interprétation.

### 3.6. Enrichissements issus de plusieurs sources

Une connaissance peut découler de plusieurs objets.

Exemple :

```text
Message M1 : préférence déclarée
Message M8 : confirmation
Message M15 : précision

Connaissance K1
  sources : M1, M8, M15
```

La structure doit permettre plusieurs références sources.

Une connaissance peut elle-même servir de source à une consolidation ultérieure.

Cela ne doit toutefois pas créer des duplications artificielles ou des chaînes sans valeur.

---

## 4. Quatre niveaux de mémoire

Le développeur choisit explicitement le niveau qui correspond à son besoin et à son budget disque.

Les niveaux représentent des contrats de conservation et de consolidation.

Ils ne doivent pas être présentés comme quatre niveaux d'intelligence du modèle.

### 4.1. Niveau 1 — Restreinte

**Niveau par défaut.**

Objectif : empreinte disque minimale, tout en conservant une mémoire utile et fiable dans les limites annoncées.

Caractéristiques :

- Conservation minimale de la session et de son parcours actif.
- Les anciennes branches peuvent devenir définitivement irrécupérables.
- Pas d'archivage durable exhaustif des appels et résultats d'outils.
- Enrichissement léger.
- Conservation possible de règles et invariants transversaux importants.
- Suppression des informations selon la politique de rétention acceptée.

La mémoire restreinte peut oublier.

Cette perte doit être assumée et clairement expliquée.

Les règles essentielles ne doivent pas devenir inaccessibles uniquement parce que ce niveau est minimal.

### 4.2. Niveau 2 — Étendue

Objectif : conserver davantage de continuité conversationnelle sans archiver les outils.

Caractéristiques :

- Toutes les branches conversationnelles sont conservées, tant que la politique de conservation et les décisions explicites du développeur le permettent.
- Historique des messages plus complet.
- Pas d'archivage durable des contenus d'outils.
- Enrichissement plus poussé.
- Conservation des invariants transversaux.
- Relations entre messages, branches et connaissances.

Une limite de stockage ne doit pas entraîner une suppression silencieuse qui contredirait la garantie annoncée de conservation des branches.

### 4.3. Niveau 3 — Avancée

Objectif : conserver les informations conversationnelles et les observations d'outils réellement utiles.

Caractéristiques :

- Toutes les garanties du niveau Étendue.
- Conservation sélective d'appels et de résultats d'outils.
- Sélection des observations pertinentes.
- Provenance détaillée des éléments retenus.
- Enrichissement approfondi.
- Relations plus riches entre connaissances et observations.

Il faut distinguer clairement les observations d'outils réellement conservées de celles qui ne le sont pas.

Ne jamais prétendre disposer du contenu complet d'un résultat si seule une représentation sélectionnée a été retenue.

### 4.4. Niveau 4 — Universelle

Objectif : **conserver 100 % du vécu enregistré et le consolider au maximum**.

Caractéristiques :

- Tous les messages.
- Toutes les branches.
- Toutes les révisions.
- Tous les appels d'outils.
- Tous les résultats d'outils.
- Tous les contenus effectivement observés et transférés au système mémoriel.
- Toutes les relations et temporalités.
- Toutes les décisions et interruptions pertinentes.
- Conservation sans perte des originaux.
- Enrichissement et structuration maximaux.
- Relations transversales entre sessions.
- Consolidations successives.
- Possibilité d'accueillir ultérieurement des mécanismes neurosymboliques.

Les contenus volumineux doivent pouvoir être reconstruits intégralement.

L'objectif de conservation universelle n'autorise aucune suppression automatique silencieuse.

La consommation peut atteindre plusieurs gigaoctets, voire davantage sur le long terme.

Ce niveau doit être clairement signalé comme potentiellement très coûteux en stockage et non recommandé par défaut.

L'exhaustivité concerne les informations réellement reçues par le système : elle n'autorise pas à prétendre connaître des données qu'il n'a jamais observées.

### 4.5. Règle commune

**La qualité et l'honnêteté de la mémoire doivent exister dans tous les niveaux.**

Une mémoire restreinte peut disposer d'informations enrichies fiables.

Une mémoire universelle peut contenir des hypothèses erronées.

Le volume conservé et la qualité des raisonnements sont deux dimensions différentes.

---

## 5. Invariants transversaux

Les invariants importants doivent pouvoir être conservés dès le niveau Restreinte.

Exemples :

- Une règle de développement explicitement fixée.
- Une préférence générale de l'utilisateur.
- Une convention de nommage.
- Une contrainte applicable à plusieurs projets.
- Une interdiction explicitement formulée.
- Une décision globale confirmée.

Ils doivent être représentés par des objets traçables possédant leur UUIDv7.

Ils peuvent posséder :

- Une portée globale.
- Une portée liée à un ou plusieurs chemins.
- Une portée liée à une session.
- Une portée conditionnelle.
- Une validité temporelle.
- Des sources.
- Un statut de validité.

Ne pas transformer automatiquement une décision locale en règle globale.

Ne pas présenter un invariant ancien comme actuellement applicable s'il a été contredit ou remplacé.

Les invariants ne doivent pas constituer une excuse pour saturer le contexte du modèle : leur sélection pour une demande donnée reste pertinente et contrôlée.

---

## 6. Chemins de travail et contexte de développement

### 6.1. Pas de projet parent obligatoire

Ne pas créer une hiérarchie imposant :

```text
Projet
  └── Sessions
```

Une conversation peut concerner cinquante projets.

Le contexte doit être associé aux opérations effectivement concernées.

### 6.2. Objets de chemin

Un chemin de travail reconnu peut constituer un objet persistant disposant d'un UUIDv7.

Il doit conserver les informations nécessaires à son identification et à sa contextualisation.

Les messages, outils, observations et enrichissements peuvent référencer un ou plusieurs chemins.

Ne pas inventer une appartenance à un projet sur la seule base du dossier actuellement ouvert dans VS Code.

### 6.3. Chemins disparus

Un chemin ancien peut devenir introuvable parce que :

- Le projet a été supprimé.
- Il a été déplacé.
- Il a été renommé.
- Un disque a été débranché.
- Le développeur travaille sur une autre machine.

Le système peut signaler qu'un chemin est actuellement introuvable.

Il ne doit pas en déduire automatiquement que la session correspondante est inutile ou supprimable.

### 6.4. Autorisations

Une mémoire ancienne indiquant qu'un fichier était accessible ne constitue pas une autorisation actuelle de le modifier ou de le relire.

Les permissions d'exécution restent régies par le système d'autorisations existant.

---

## 7. Persistance et architecture de stockage

### 7.1. Localisation

La mémoire doit être stockée localement.

Aucun service cloud de synchronisation n'est requis.

Aucune application indépendante n'est requise.

Le stockage doit être géré par un composant clairement identifié au sein de l'extension.

Éviter que plusieurs modules écrivent librement et simultanément dans les mêmes données persistantes.

### 7.2. Durabilité

Une donnée déclarée enregistrée doit réellement être persistée.

Prévoir :

- Écritures atomiques ou transactionnelles selon le support.
- Reprise après interruption.
- Protection contre les écritures partielles.
- Validation des objets à la lecture.
- Gestion des erreurs disque.
- Gestion des migrations de schéma.
- Prévention des doublons lors des reprises.
- Reconstruction des index dérivés lorsque nécessaire.

La fermeture de VS Code peut être brutale.

Il ne faut donc pas dépendre d'un unique événement de fermeture pour sauvegarder les données importantes.

### 7.3. Séparation logique et physique

**L'identité métier d'un objet est distincte de la représentation physique de son contenu.**

Exemple :

```text
ToolResult R1
  UUIDv7 : ...
  appel : T1
  contenu : référence vers bloc X

ToolResult R2
  UUIDv7 : ...
  appel : T2
  contenu : référence vers bloc X
```

Deux résultats distincts peuvent référencer un même bloc de contenu lorsque leurs octets sont strictement identiques.

Leurs identités, contextes et temporalités restent distincts.

### 7.4. Optimisations recherchées

Étudier une combinaison de :

- Représentation binaire compacte.
- Compression sans perte.
- Déduplication des contenus.
- Empreintes cryptographiques, par exemple SHA-256.
- Stockage différentiel par deltas lorsque pertinent.
- Références vers les blocs communs.
- Index efficaces.
- Écritures incrémentales.
- Limitation des réécritures physiques inutiles.

Ces optimisations doivent être évaluées selon leur coût réel.

Le format binaire ne garantit pas à lui seul une réduction importante.

Une empreinte SHA-256 n'est pas un algorithme de compression.

Un delta n'est pas forcément plus petit qu'un contenu complet compressé.

### 7.5. Exemple de versions d'un fichier

```text
Lecture 1 : fichier de 1 000 lignes
Lecture 2 : fichier de 500 lignes
Lecture 3 : retour à 1 000 lignes
Lecture 4 : modification de 10 lignes
```

L'objectif est de pouvoir reconstruire exactement chaque version conservée sans stocker systématiquement quatre copies intégrales.

Le moteur physique peut utiliser :

- Un contenu complet compressé.
- Un delta.
- Un bloc déjà existant.
- Une combinaison de ces mécanismes.

Il doit choisir une représentation cohérente avec les garanties de reconstruction et les performances.

Limiter les chaînes de dépendance excessives : retrouver une version ne doit pas exiger de rejouer indéfiniment des milliers d'opérations.

### 7.6. Gestion des références partagées

Si plusieurs sessions ou branches utilisent un même bloc physique, supprimer l'une d'elles ne doit pas détruire le contenu encore nécessaire aux autres.

La récupération d'espace doit tenir compte des références réellement restantes.

Il faut distinguer :

- Taille logique des données.
- Occupation physique réelle.
- Espace effectivement récupérable après suppression.

### 7.7. Mesures

Le moteur doit permettre d'évaluer :

- Volume brut théorique.
- Volume réellement occupé.
- Gain de compression.
- Gain de déduplication.
- Gain des deltas.
- Coût des index.
- Coût des enrichissements.
- Coût des écritures et reconstructions.

Ne pas annoncer de taux de compression garanti sans mesures.

---

## 8. Budget disque et recommandations

### 8.1. Principe

Le développeur décide du budget mémoire.

L'extension recommande une valeur en fonction de l'espace réellement disponible sur le volume de stockage concerné.

Ne pas calculer le budget uniquement à partir de la capacité totale du SSD.

### 8.2. Recommandations automatiques

Pour les trois premiers niveaux :

| Niveau     | Pourcentage de l'espace libre |
| ---------- | ----------------------------: |
| Restreinte |                        0,01 % |
| Étendue    |                           1 % |
| Avancée    |                           5 % |

Le résultat du calcul automatique est plafonné à **10 Go** pour chacun de ces trois niveaux.

Formule conceptuelle :

```text
budget_recommande =
    min(espace_libre * coefficient_du_niveau, 10 Go)
```

Pour le niveau Universelle :

- Pas de plafond automatique de 10 Go.
- Recommandation adaptée à l'espace disponible.
- Réserve de sécurité indispensable pour le système.
- Avertissement explicite concernant les consommations potentiellement massives.

### 8.3. Liberté du développeur

Ces valeurs sont des recommandations.

Le développeur peut choisir moins ou plus.

Une fois un budget explicitement choisi, il ne doit pas être silencieusement remplacé chaque fois que l'espace disque évolue.

La baisse de l'espace libre peut déclencher une alerte et une nouvelle recommandation.

### 8.4. Gestion des limites

Le système doit connaître :

- Le budget autorisé.
- L'occupation réelle.
- L'espace libre restant.
- Les données pouvant être purgées.
- Les données protégées par le niveau choisi.
- Les conséquences des suppressions.

Un budget atteint ne doit pas provoquer une perte arbitraire de données.

En niveau Universelle, il faut suspendre les nouvelles captures impossibles à garantir, avertir le développeur et ne pas prétendre avoir enregistré des données absentes.

Ne pas laisser une erreur de persistance passer pour une sauvegarde réussie.

---

## 9. Gestionnaire des sessions et du stockage

L'extension doit proposer une interface permettant au développeur de comprendre et gérer sa mémoire.

### 9.1. Informations générales

Afficher notamment :

- Niveau actuellement actif.
- Niveau demandé, s'il existe.
- Budget autorisé.
- Occupation physique.
- Espace disque libre.
- Avertissements.
- État de la consolidation.

### 9.2. Liste des sessions

Pour chaque session :

- Identité.
- Titre ou description disponible.
- Date de création.
- Dernière activité.
- Nombre de branches.
- Niveau ou garanties de conservation applicables aux données.
- Taille logique estimée.
- Espace réellement récupérable.
- Chemins associés.
- État de disponibilité de ces chemins.
- Éventuels avertissements.

### 9.3. Suggestions de nettoyage

Le système peut signaler :

- Sessions très anciennes.
- Sessions volumineuses.
- Branches anciennes.
- Chemins introuvables.
- Données d'outils volumineuses.
- Archives dont le développeur pourrait ne plus avoir besoin.

Ces indications sont des suggestions, jamais des preuves d'inutilité.

### 9.4. Suppressions

Le développeur doit pouvoir examiner :

- Les sessions supprimables.
- Les branches supprimables.
- Les contenus secondaires supprimables.
- L'espace récupérable.
- Les informations et relations qui seront perdues.
- Les enrichissements affectés.
- Les invariants transversaux concernés.

Les suppressions manuelles nécessitent un accord explicite.

Les suppressions automatiques ne sont permises que dans les limites du contrat mémoriel préalablement accepté.

Une session supprimée doit être réellement supprimée selon la politique choisie, et non conservée clandestinement dans un autre index ou enrichissement.

Les références partagées doivent être traitées correctement.

---

## 10. Consolidation de la mémoire

### 10.1. Principe

La consolidation enrichit progressivement les données disponibles.

Elle ne doit pas remplacer ni falsifier les originaux conservés.

La consolidation n'est jamais un prérequis à l'utilisation d'une donnée.

Une information brute est immédiatement consultable dès qu'elle est enregistrée.

### 10.2. Consolidation incrémentale

**Une information déjà correctement enrichie ne doit pas être réanalysée sans raison.**

Exemple :

```text
Message M1
  "Bonjour Rémi, comment vas-tu ?"

Enrichissement E1
  émotion supposée : joyeux
```

Après la création d'E1, il n'y a aucune raison de retraiter continuellement M1.

Un réexamen peut être justifié par :

- Une nouvelle information pertinente.
- Une contradiction.
- Une correction.
- Une nouvelle relation à établir.
- Une demande explicite de réexamen.
- Une amélioration du moteur nécessitant une réévaluation autorisée.

La simple réouverture de VS Code ne constitue pas une raison de retraiter toute la mémoire.

### 10.3. Dépendances

Les enrichissements connaissent leurs sources.

Lorsqu'une nouvelle donnée apparaît, le moteur recherche les connaissances potentiellement concernées.

Il ne doit pas réexaminer toute la mémoire sans nécessité.

Les dépendances doivent permettre des réévaluations ciblées.

### 10.4. Pendant une conversation

La consolidation peut fonctionner pendant une session active.

L'IA principale peut consulter les enrichissements déjà disponibles.

Une donnée reçue quelques instants auparavant peut être enrichie et réutilisée au cours de la même session.

Une session n'a pas besoin d'être terminée pour que ses informations soient consolidables.

La consolidation peut également traiter des données plus anciennes pendant que l'IA principale travaille sur une nouvelle demande.

### 10.5. Pendant l'inactivité

Lorsque l'extension est active mais que l'IA principale n'effectue pas de tâche prioritaire, le système peut effectuer les travaux de consolidation en attente.

L'inactivité est une opportunité d'exécution, pas un déclencheur de réanalyse générale.

### 10.6. Charge de travail

La consolidation doit rester légère.

Elle ne doit pas :

- Bloquer la conversation.
- Monopoliser le CPU ou le GPU.
- Déclencher des analyses complètes répétitives.
- Faire relire inutilement l'intégralité des sessions.
- Imposer systématiquement une seconde inférence lourde.

Privilégier des unités de travail courtes, incrémentales et interrompables.

La priorité reste l'expérience du développeur et les opérations de l'IA principale.

### 10.7. Interruption et reprise

Si VS Code ferme :

- Les traitements en cours s'arrêtent.
- Les données déjà confirmées restent persistées.
- Les travaux incomplets doivent pouvoir reprendre plus tard.
- Aucune duplication d'enrichissement ne doit résulter d'une reprise.
- Les originaux restent utilisables.

### 10.8. Consolidation non disponible

Si un enrichissement n'est pas encore disponible, le rappel retourne simplement la donnée originelle et les enrichissements existants.

Ne pas bloquer le rappel.

Ne pas inventer un enrichissement manquant.

### 10.9. Moteur d'enrichissement

Ne pas imposer immédiatement une IA spécialisée.

Prévoir une abstraction permettant plusieurs stratégies :

- Extraction déterministe.
- Analyse par règles.
- Analyse contextuelle par le modèle existant, lorsque pertinente.
- Moteur spécialisé futur.
- Mécanisme neurosymbolique futur.

Les capacités réellement disponibles doivent être distinguées des extensions futures.

---

## 11. Rappel et réinjection de mémoire

### 11.1. Principe

Le modèle ne doit pas recevoir automatiquement l'intégralité de l'historique des sessions.

Le rappel doit être pertinent, sélectif et contrôlé.

L'objectif est d'augmenter la qualité du contexte transmis sans gaspiller la fenêtre de contexte.

### 11.2. Recherche mémorielle

Prévoir une capacité de recherche, notamment via un outil accessible à l'IA.

Nom indicatif :

```text
memory.search
```

Les critères peuvent inclure :

- Recherche textuelle.
- Recherche par identifiant UUIDv7.
- Session.
- Branche.
- Auteur.
- Période.
- Chemin de travail.
- Catégorie.
- Tags.
- Décisions.
- Invariants.
- Statut de validité.
- Relations.
- Sources originales.
- Enrichissements.

La recherche doit pouvoir retrouver le contexte autour d'un résultat, pas uniquement un texte isolé.

### 11.3. Remontée de provenance

Exemple :

L'IA retrouve un ancien résultat de `read_file`.

Si les données sont encore conservées, elle doit pouvoir retrouver :

- L'UUID du résultat.
- L'UUID de l'appel.
- L'outil concerné.
- Les paramètres pertinents.
- La demande utilisateur d'origine.
- La session.
- La branche.
- La temporalité.
- Les autres opérations liées.
- La réponse finale éventuelle.
- Les enrichissements associés.

Il doit également être possible de partir d'une demande utilisateur et de retrouver les opérations qui en ont découlé.

### 11.4. Réinjection

La réinjection est une composition contrôlée.

Elle peut contenir :

- Des extraits originaux.
- Des enrichissements.
- Des invariants applicables.
- Des observations d'outils.
- Des informations de provenance.
- Des indications de validité ou d'incertitude.

Les originaux ne sont jamais modifiés pour fabriquer le contexte injecté.

Une information issue d'une branche abandonnée ou ancienne doit être identifiée comme telle lorsque cette distinction est pertinente.

### 11.5. Lacunes mémorielles

Si une ancienne branche ou un résultat d'outil a été supprimé, l'IA ne doit pas prétendre le retrouver.

Une synthèse sans original encore disponible ne doit pas être présentée comme une citation vérifiable.

Les réponses doivent distinguer :

- Source originale disponible.
- Connaissance enrichie avec source disponible.
- Connaissance conservée sans source originale.
- Information manquante.
- Information potentiellement obsolète.

### 11.6. Limites de contexte

Le moteur de rappel doit respecter les budgets de contexte.

Éviter les retours massifs non demandés.

Permettre de récupérer davantage de détails lorsque nécessaire.

La pertinence et les garanties de provenance priment sur la quantité brute injectée.

---

## 12. Intégration aux outils existants

### 12.1. Préserver l'architecture actuelle

L'extension possède déjà des outils locaux, distants et MCP, ainsi qu'un système d'autorisations.

Ne pas les réécrire inutilement.

Intégrer la mémoire à leur fonctionnement existant.

Le système actuel comporte notamment des capacités de :

- Lecture et écriture de fichiers.
- Recherche.
- Exploration des répertoires.
- Exécution de commandes.
- Sélection de texte.
- Accès distant HTTP selon les outils disponibles.
- Appels MCP.

Le code réel du dépôt fait autorité pour les noms exacts et les interfaces.

### 12.2. Traçabilité des outils

Lorsqu'un appel est conservé :

- Il possède son UUIDv7.
- Son identité d'outil est connue.
- Ses paramètres réellement transmis sont identifiables.
- Sa demande d'origine est référencée.
- Son exécution possède un état explicite.
- Son résultat éventuel possède son propre UUIDv7.
- Le résultat référence l'appel exact.
- Sa temporalité est conservée.

Chaque invocation distincte possède sa propre identité, même si elle concerne le même outil ou les mêmes paramètres.

### 12.3. États des résultats

Préserver les distinctions existantes entre :

- Succès.
- Erreur.
- Refus explicite de l'utilisateur.
- Annulation.
- Interruption.
- Résultat inconnu ou incertain.

Une permission refusée ne doit pas être assimilée à une erreur technique.

Une absence de réponse de l'utilisateur ne doit pas devenir artificiellement un refus.

Un outil potentiellement exécuté avant une interruption ne doit pas être relancé aveuglément.

### 12.4. Autorisations

Conserver les modes et mécanismes d'autorisation existants.

Le niveau mémoriel n'accorde pas de nouvelles permissions sur les fichiers, commandes, ressources réseau ou outils.

La mémoire d'une autorisation ancienne n'est pas une autorisation actuelle.

Le système mémoriel doit respecter les protections et décisions existantes.

### 12.5. Enrichissement des résultats d'outils

L'enrichissement contextuel destiné à l'IA est transversal.

Il ne se limite pas à l'interface graphique.

Un résultat peut fournir :

- Son opération.
- Sa ressource.
- Son statut réel.
- Les données obtenues.
- Son contexte de provenance.
- Les limites de l'observation.
- Les informations pertinentes pour la suite du raisonnement.

L'IA doit pouvoir exploiter ces informations sans confondre une observation, une supposition et une autorisation.

### 12.6. Niveaux de conservation des outils

Le niveau de mémoire détermine leur archivage durable :

- Restreinte : pas d'archivage durable des appels et résultats complets.
- Étendue : pas d'archivage durable des outils, mais informations consolidées pertinentes possibles.
- Avancée : sélection et conservation des appels/résultats utiles.
- Universelle : conservation exhaustive des appels et résultats observés.

Cela ne doit pas empêcher l'exécution normale des outils ni leur utilisation dans le contexte immédiat de la conversation.

---

## 13. Interface utilisateur

L'interface doit rester cohérente avec l'extension VS Code existante.

Ne pas développer une application graphique externe.

### 13.1. Configuration de la mémoire

Permettre de consulter et choisir :

- Niveau Restreinte.
- Niveau Étendue.
- Niveau Avancée.
- Niveau Universelle.
- Budget disque recommandé.
- Budget personnalisé.
- Occupation actuelle.
- Conséquences du niveau choisi.

La Restreinte est le niveau par défaut.

Les engagements de conservation doivent être compréhensibles avant activation.

### 13.2. Transparence

Informer le développeur de manière claire :

- Ce qui est conservé.
- Ce qui ne l'est pas.
- Ce qui peut être supprimé automatiquement.
- Ce qui est définitivement perdu lors d'une purge.
- Ce qui peut encore être reconstitué.
- Ce que coûte le niveau choisi.
- Ce qui relève d'un enrichissement plutôt que d'une observation originelle.

La fiabilité ne doit pas être vendue comme une garantie de mémoire infinie.

### 13.3. Gestion des archives

Prévoir la consultation des sessions et branches, avec les informations de stockage définies précédemment.

Le développeur doit pouvoir identifier les archives anciennes ou volumineuses.

Il doit pouvoir prendre des décisions ciblées sans être obligé de supprimer toute sa mémoire.

### 13.4. État de consolidation

L'interface peut indiquer sobrement :

- Données en attente d'enrichissement.
- Consolidation en cours.
- Dernière consolidation validée.
- Erreur éventuelle.
- Traitement interrompu ou repris.

Ne pas transformer cette activité en une interface envahissante.

---

## 14. Changement de niveau mémoriel

### 14.1. Intention différée

Le développeur peut demander un changement à tout moment.

Le système distingue :

```text
niveau_actif
niveau_demande
etat_transition
```

Une demande n'implique pas une application immédiate.

### 14.2. Cohérence

Si une conversation, un appel d'outil, une écriture ou une consolidation incompatible avec la transition est en cours, le changement attend un point de cohérence.

Le système peut suspendre temporairement le lancement de nouveaux travaux de consolidation pour atteindre ce point.

Il ne doit pas attendre indéfiniment la fin de tous les travaux futurs.

### 14.3. Passage à un niveau supérieur

L'augmentation :

- Applique les nouvelles garanties aux données futures.
- Conserve les données déjà disponibles.
- Ne recrée pas les données supprimées auparavant.
- Peut permettre de nouveaux enrichissements à partir des sources existantes.
- Ne doit pas provoquer de suppression.

La demande est appliquée lorsque l'état devient cohérent.

### 14.4. Passage à un niveau inférieur

Le développeur choisit explicitement ce qu'il souhaite faire des archives existantes :

1. Conserver les archives déjà enregistrées.
2. Examiner les données à supprimer pour réduire l'occupation.
3. Effectuer un nettoyage ciblé de sessions, branches ou contenus.

La baisse de niveau ne constitue pas automatiquement une autorisation de supprimer les archives historiques.

### 14.5. Contexte disque

Le système doit examiner l'espace libre et les archives existantes.

Exemple :

```text
Mémoire occupée : 50 Go
Espace disque libre : 50 Go
Nouveau niveau demandé : Restreinte
```

Dans ce cas, il est pertinent de mettre en avant les options permettant de libérer de l'espace.

La recommandation ne doit pas être une suppression automatique.

### 14.6. Transition différée et reprise

La demande doit être persistée.

Si VS Code s'arrête avant son application, elle doit pouvoir être reprise à la prochaine activation.

Le niveau actif ne change qu'après application cohérente.

Une transition échouée doit rester identifiable.

Le développeur doit connaître l'état réel, pas seulement le niveau souhaité.

### 14.7. Annulation

Une demande encore en attente peut être annulée.

Une transition déjà engagée dans une opération critique doit atteindre un état cohérent avant d'être considérée comme terminée ou échouée.

---

## 15. Suppression, cohérence et provenance

### 15.1. Suppression d'une session

La suppression complète d'une session doit examiner :

- Les branches.
- Les messages.
- Les appels et résultats conservés.
- Les enrichissements.
- Les relations.
- Les références croisées.
- Les blocs physiques partagés.
- Les connaissances éventuellement dérivées.

Ne pas laisser des objets orphelins présentés comme des informations vérifiées.

### 15.2. Informations dérivées

Lorsqu'une source originale est supprimée :

- Les informations dérivées exclusivement de cette source doivent être traitées selon les règles de rétention et les choix du développeur.
- Une information conservée sans sa source doit signaler cette perte de vérifiabilité.
- Les invariants transversaux importants ne doivent pas être détruits par inadvertance.
- Une connaissance partagée entre plusieurs sources ne doit pas être supprimée sans examiner ses autres dépendances.

### 15.3. Références physiques

Les contenus physiques mutualisés ne sont supprimables que lorsqu'aucune donnée conservée ne les référence encore.

La récupération d'espace doit être cohérente et vérifiable.

### 15.4. Suppression automatique

Elle n'est autorisée que pour les niveaux et situations où elle fait explicitement partie du contrat accepté.

Aucune suppression arbitraire de l'historique exhaustif Universel.

Les actions destructrices manuelles doivent être précédées d'une présentation intelligible de leurs conséquences.

---

## 16. Cycle de vie dans VS Code

### 16.1. Architecture retenue

Le moteur mémoriel appartient à l'extension.

Il ne dépend pas d'une application installée séparément.

Il n'exige pas de processus permanent.

Il ne nécessite pas de service système.

### 16.2. Activation

À l'activation de l'extension :

- Initialiser les composants nécessaires.
- Vérifier le stockage.
- Restaurer les états persistants.
- Rendre la mémoire disponible.
- Reprendre progressivement les travaux en attente.
- Éviter une consolidation massive bloquante au démarrage.

### 16.3. Pendant l'exécution

La mémoire doit pouvoir :

- Enregistrer les données nouvelles.
- Répondre aux recherches.
- Fournir du contexte enrichi.
- Consolider progressivement des informations antérieures.
- Surveiller son budget disque.
- Traiter les changements de niveau en attente.

Ces responsabilités ne doivent pas provoquer de blocages perceptibles de l'extension.

### 16.4. Fermeture

Lorsque VS Code et l'extension s'arrêtent, les traitements mémoriels s'arrêtent.

Le système doit être conçu pour cette éventualité, y compris en cas de fermeture brutale.

Il ne faut pas promettre une consolidation après fermeture sans infrastructure spécifique.

Cette infrastructure n'est pas demandée dans cette phase.

---

## 17. Architecture logicielle recommandée

La structure exacte doit être adaptée au dépôt existant.

Ne pas réorganiser gratuitement les modules déjà fonctionnels.

Séparer clairement les responsabilités :

### Domaine

Définitions des objets persistants :

- Sessions.
- Messages.
- Branches.
- Révisions.
- Appels et résultats conservés.
- Chemins.
- Enrichissements.
- Connaissances.
- Relations.
- Configurations mémorielles.

### Stockage

Responsable de :

- Sérialisation.
- Transactions.
- Index.
- Références physiques.
- Compression.
- Déduplication.
- Deltas.
- Intégrité.
- Récupération.
- Migrations.

### Conservation

Responsable de :

- Niveaux mémoriels.
- Politiques de rétention.
- Budgets.
- Suppressions autorisées.
- Protection des données.
- Transitions de niveau.

### Consolidation

Responsable de :

- Identification des nouvelles données pertinentes.
- Création des enrichissements.
- Dépendances.
- Réexamen ciblé.
- Reprise après interruption.
- Priorités de traitement.

### Rappel

Responsable de :

- Recherche.
- Sélection des informations.
- Résolution des relations.
- Provenance.
- Composition des originaux et enrichissements.
- Budgets de contexte.
- Réinjection.

### Intégration

Responsable des liens avec :

- Les sessions de conversation existantes.
- Les fournisseurs de modèles.
- Les outils.
- Les permissions.
- Les MCP.
- Les Webviews et commandes VS Code.

Ces séparations sont logiques. Elles ne constituent pas une obligation de créer autant de processus, ni autant de structures que possible.

Chaque abstraction doit avoir une responsabilité concrète.

---

## 18. Compatibilité et migration de l'existant

Le dépôt possède déjà un fonctionnement conversationnel et des mécanismes de persistance.

Avant toute modification, examiner le code réel.

Préserver :

- Les sessions utilisateur existantes.
- Les configurations.
- Les modes d'autonomie.
- Le système d'autorisations.
- Les outils locaux.
- Les outils MCP.
- Les fournisseurs de modèles.
- Les messages d'erreur et résultats structurés existants.
- Les modifications non liées présentes dans le dépôt.

Si une migration de données est nécessaire :

- La rendre explicite.
- Préserver les données disponibles.
- Gérer les anciens formats.
- Ne pas inventer des liens de provenance que l'ancien format ne possédait pas.
- Ne pas prétendre que l'ancien historique contient des observations d'outils qui n'avaient jamais été archivées.
- Prévoir une reprise cohérente en cas d'interruption.

Les UUIDv7 s'appliquent aux nouvelles identités métier et aux identités créées lors des migrations, sans falsifier la provenance des anciennes données.

---

## 19. Exigences de fiabilité

Le système doit garantir les propriétés suivantes dans les limites du niveau mémoriel sélectionné.

### 19.1. Traçabilité

Les relations réellement enregistrées doivent être fiables et vérifiables.

### 19.2. Intégrité

Un original conservé ne doit pas être modifié par une consolidation.

### 19.3. Cohérence

Une interruption ne doit pas laisser la mémoire dans un état considéré à tort comme valide.

### 19.4. Reprise

Une opération interrompue doit pouvoir être identifiée et reprise lorsqu'une reprise est sûre.

### 19.5. Déduplication

La mutualisation physique ne doit pas fusionner les identités métier.

### 19.6. Rétention

Aucune suppression incompatible avec le niveau choisi et les autorisations données.

### 19.7. Transparence

Le développeur doit pouvoir connaître les limites du niveau sélectionné et les conséquences de ses choix.

### 19.8. Non-blocage

La consolidation ne doit pas ralentir lourdement l'utilisation de l'extension.

### 19.9. Honnêteté mémorielle

L'IA ne doit pas présenter une synthèse, une hypothèse ou une source supprimée comme une observation originale vérifiée.

### 19.10. Respect des autorisations

La mémoire ne doit pas servir à contourner une permission d'outil, une interdiction utilisateur ou une limite d'accès.

---

## 20. Stratégie de réalisation

L'objectif est une implémentation cohérente de la mémoire dans l'extension actuelle.

Ne pas ajouter de service autonome ni repousser artificiellement la fonctionnalité pour préparer une architecture distribuée future.

Ne pas construire une IA neurosymbolique complète dès cette phase.

Ne pas se limiter non plus à un faux système de mémoire qui ne ferait qu'enregistrer quelques résumés sans relations, provenance ni gestion des branches.

L'implémentation doit respecter les garanties du modèle.

### Impératif

- Intégration directe à BezotCorp AI.
- UUIDv7 pour les nouvelles identités métier.
- Objets et relations traçables.
- Branches et révisions cohérentes.
- Enrichissements séparés des originaux.
- Quatre niveaux aux contrats distincts.
- Persistance fiable.
- Consolidation incrémentale, légère et non bloquante.
- Rappel exploitable pendant les sessions.
- Intégration correcte aux outils existants.
- Budget disque configurable.
- Gestion des archives et suppressions.
- Transitions de niveau différées et cohérentes.
- Préservation des autorisations existantes.

### Recommandé

- Stockage physique optimisé.
- Compression sans perte.
- Déduplication par empreinte.
- Deltas lorsque réellement avantageux.
- Traitement ciblé par dépendances.
- Index reconstruisibles.
- Estimation précise de l'espace récupérable.
- Possibilité d'évolution du moteur de consolidation.
- Mesures permettant d'améliorer les performances et l'empreinte disque.

### Évolutions futures non obligatoires

- Moteur neurosymbolique.
- IA spécialisée pour la mémoire.
- Recherche sémantique avancée.
- Synchronisation entre machines.
- Service mémoriel indépendant.
- Exploitation par d'autres IDE.
- Stockage universel sur volumes de plusieurs téraoctets.

Ces possibilités ne doivent pas justifier une complexité prématurée.

---

## 21. Consignes de travail pour Claude

1. Examiner l'architecture réelle du dépôt avant de modifier le code.

2. Identifier les composants déjà existants qui peuvent être réutilisés.

3. Préserver les modifications utilisateur non liées au travail demandé, notamment les changements existants dans les fichiers de configuration et de dépendances.

4. Travailler dans la branche courante sans créer de branche, commit, push ou pull request non demandés.

5. Ne pas remplacer inutilement des composants fonctionnels par une nouvelle architecture artificielle.

6. Ne pas imposer un modèle événementiel universel si des objets métier correctement liés satisfont les exigences.

7. Ne pas créer d'objets ou de structures redondants pour représenter la même réalité.

8. Ne pas modifier silencieusement les données historiques.

9. Ne pas inventer de données manquantes lors des migrations.

10. Ne pas introduire de service permanent ni d'application supplémentaire.

11. Respecter le système de permissions existant.

12. Ne pas ajouter de tests permanents sans demande explicite. Effectuer les vérifications de compilation, de formatage et de cohérence possibles, en signalant précisément ce qui a été vérifié.

13. Ne pas considérer une compilation réussie comme une preuve suffisante de fiabilité de la persistance.

14. Signaler explicitement les limitations techniques et les garanties non encore satisfaites.

15. Privilégier une réalisation cohérente et intégrée plutôt qu'une succession de modifications fragmentaires et contradictoires.

16. Ne pas affirmer qu'une fonctionnalité est terminée si son comportement réel n'a pas été vérifié.

17. Documenter les décisions techniques qui ont un impact sur la durabilité des données.

---

## 22. Critères de validation fonctionnelle

L'architecture sera considérée cohérente si elle peut satisfaire notamment les scénarios suivants.

### Scénario A — Plusieurs outils

Une demande utilisateur déclenche trois appels distincts.

Chaque appel possède son propre UUIDv7.

Chaque résultat retrouve exactement son appel.

La demande initiale et l'éventuelle réponse finale restent reliées aux opérations concernées.

### Scénario B — Branche révisée

L'utilisateur modifie une ancienne demande.

Un nouveau parcours conversationnel est créé.

L'ancien parcours n'est pas réécrit.

Les objets communs sont mutualisés plutôt que copiés inutilement.

### Scénario C — Enrichissement

Un message possède une catégorie et une émotion supposée.

Le contenu du message reste inchangé.

Une nouvelle information permet d'ajouter une seconde émotion ou de corriger la première.

L'historique de cette évolution reste traçable.

### Scénario D — Consolidation en cours

L'IA demande un souvenir alors que son enrichissement est encore en traitement.

Le système retourne immédiatement l'original et les enrichissements déjà validés.

Aucune attente de consolidation n'est imposée.

### Scénario E — Nouvelle contradiction

Une règle ancienne est contredite par une déclaration ultérieure.

Seules les connaissances concernées sont réexaminées.

L'ancienne règle ne disparaît pas silencieusement de l'histoire.

### Scénario F — Restreinte

Une ancienne branche a été purgée conformément au niveau accepté.

Le système ne prétend pas pouvoir la restaurer.

Les invariants importants encore conservés restent exploitables, avec indication de provenance lorsque disponible.

### Scénario G — Universelle

Un même fichier est lu de nombreuses fois avec des versions différentes.

Chaque observation reste identifiable.

Les contenus conservés peuvent être reconstruits intégralement.

Le stockage physique évite autant que possible les duplications inutiles.

### Scénario H — Changement de niveau

Une transition est demandée pendant une opération.

Le niveau actif reste identifiable.

La transition attend un état cohérent.

Le changement est appliqué ou signalé comme impossible, sans état partiellement validé.

### Scénario I — Disque presque plein

Le système constate que l'espace libre devient faible.

Il informe le développeur.

Il propose notamment les anciennes sessions, les données volumineuses et les chemins introuvables.

Il estime l'espace récupérable.

Il ne détruit pas arbitrairement des archives protégées.

### Scénario J — Fermeture brutale

VS Code s'arrête pendant une consolidation.

Les données déjà validées restent utilisables.

Les travaux incomplets sont identifiables.

La reprise n'entraîne ni corruption ni duplication logique.

### Scénario K — Suppression d'une session

Le développeur supprime une ancienne session.

Les dépendances sont examinées.

Les blocs partagés encore utilisés sont conservés.

Les données propres à la session sont supprimées selon les garanties annoncées.

Les connaissances restantes ne présentent pas une provenance fictive.

### Scénario L — Rappel transverse

Une règle globale ancienne s'applique à une nouvelle demande dans une autre session.

Le système peut la retrouver sans injecter l'intégralité des anciennes conversations.

Son champ d'application et son statut restent vérifiables.

---

## Conclusion

BezotCorp AI doit disposer d'une mémoire structurée autour d'un principe central :

**Les données originelles constituent le vécu ; les enrichissements construisent la connaissance ; les relations et la temporalité permettent d'en retrouver la provenance.**

Les quatre niveaux de mémoire permettent au développeur de choisir le compromis qui lui convient entre conservation, enrichissement et consommation disque.

La consolidation doit être incrémentale, légère et disponible pendant les conversations.

Le rappel doit être sélectif, traçable et honnête quant aux limites de ce qui a réellement été conservé.

L'ensemble doit fonctionner directement dans l'extension VS Code, sans dépendance à une application autonome.

L'objectif n'est pas seulement de stocker des discussions : il est de construire une infrastructure de mémoire durable, évolutive et exploitable, capable de servir ultérieurement des formes de raisonnement plus avancées, tout en respectant les ressources, les permissions et les décisions du développeur.
