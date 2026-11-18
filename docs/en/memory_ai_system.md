# BezotCorp AI — General specification for a persistent, structured and evolving memory system

[Documentation](../docs_index.md) · [Français](../fr/memory_ai_system.md)

## Purpose of this document

This document is the reference specification for implementing a persistent memory system within the **BezotCorp AI** VS Code extension.

The goal is to build memory capable of retaining, structuring, enriching, retrieving and reinjecting information from interactions between a developer, an AI and its tools.

The design must reconcile five requirements:

1. **Rigorous traceability** of data and its relationships.
2. **Enrichable memory**, without falsifying retained original data.
3. **Controlled disk usage**, configurable and transparent.
4. **Immediate use during conversations**, without waiting for a session to end.
5. An architecture extensible enough to accommodate specialized analysis engines later, including neurosymbolic engines.

Memory must become reliable knowledge infrastructure without turning the VS Code extension into an unnecessarily complex distributed architecture.

### Immediate scope

The work concerns the existing extension and its coherent evolution.

It includes:

- Integrating memory into the extension.
- Durable persistence.
- Domain objects and their relationships.
- Branches and revisions.
- The four memory levels.
- Incremental consolidation.
- Contextual recall.
- Integration with local and MCP tools.
- Control of disk resources.
- Browsing and configuration interfaces.

It does not include:

- Creating an external `memory_ai` application.
- Installing `systemd` services.
- Creating a supervisor.
- Running processing after VS Code has completely closed.
- Immediately developing a neurosymbolic AI.
- Requiring a second AI.

These possibilities may be studied later without becoming prerequisites.

---

## 1. Mandatory architectural principles

### 1.1. Object identity

All new persistent domain objects must have a unique **UUIDv7** identifier.

This includes, in particular:

- Sessions.
- Branches.
- Messages.
- AI requests and work steps when they correspond to distinct objects.
- Tool calls.
- Tool results.
- Permission decisions when retained.
- Revisions.
- Enrichments.
- Consolidated knowledge.
- Working paths.
- Persistent relationships when they carry domain attributes or their own identity.
- Deferred configuration change requests.

UUIDv7 identifiers are domain identities.

Cryptographic hashes used for content deduplication never replace them.

An object must not receive multiple unnecessary identifiers representing the same identity.

### 1.2. Explicit relationships

Every object must be able to reference the objects on which it depends.

Relationships must allow a provenance chain to be traced backward and its consequences to be found.

Conceptual example:

```text
User request U1
  |
  +-- AI work A1
       |
       +-- Tool call T1: read_file
       |    +-- Result R1
       |
       +-- Tool call T2: read_web
       |    +-- Result R2
       |
       +-- Tool call T3: read_api_meteo
       |    +-- Result R3
       |
       +-- Final response M1
```

Calls T1, T2 and T3 have three distinct UUIDv7 identifiers.

Result R2 explicitly references T2, rather than simply “the last tool called”.

One request may trigger several tools, several reasoning steps or several responses.

Do not impose an artificially linear structure when actual relationships are multiple.

Never invent a causal relationship to fill a gap in the data.

### 1.3. Time and ordering

Memory must do more than retain dates.

It must make it possible to retrieve:

- An object's creation date.
- The actual order of operations.
- Message sequence.
- Session membership.
- The path through a branch.
- Relationships between versions.
- When an observation was obtained.
- When an enrichment was created.
- When knowledge was corrected or invalidated.

Ordering must be deterministic.

A timestamp alone is not necessarily sufficient, particularly for operations performed almost simultaneously.

Use an ordering representation suitable for storage and TypeScript without confusing chronological order with causality.

### 1.4. Nature of objects

Do not impose an artificial event model.

A session is a container object.

A message is an object representing a message.

A tool call represents an actual tool invocation.

A tool result represents its actual result.

An enrichment represents added knowledge or annotation.

A chronological log is permitted when it provides technical value.

However, it must not systematically duplicate each object as a second artificial event object.

The priority is to retain actual objects, their identities, order and relationships.

### 1.5. Typing and validation

Use explicit TypeScript types.

Closed categories must be represented by discriminated unions or equivalent mechanisms.

Every message must have an author.

Do not infer authorship from position in the conversation.

Two user messages may follow one another.

An AI response may be interrupted or never produced.

Persistent objects must be validated when read.

No external or old data may be treated as structurally valid without verification.

---

## 2. Sessions, messages, branches and revisions

### 2.1. Session as the root

The session is the root of conversation history.

Do not impose a project hierarchy above sessions.

One session may address several projects, directories, files and domains.

Memory must therefore not assume that a session necessarily belongs to a single project.

### 2.2. Messages

Depending on the memory level, a message must retain:

- Its UUIDv7.
- Its author.
- Its original content.
- Its timing and order.
- Its session membership.
- Its links to the relevant branches.
- Its relationships with associated requests, tools and responses.
- Any interrupted or incomplete state.

A retained message must not be silently rewritten by an enrichment.

### 2.3. Branches

Branches enable multiple conversation paths within a single session.

Example:

```text
Message M1
   |
Message M2
   |
   +------ Branch B1
   |         |
   |         M3
   |         |
   |         M4
   |
   +------ Branch B2
             |
             M5
             |
             M6
```

Shared objects must not be copied unnecessarily.

A branch has its own UUIDv7 and references the objects forming its path.

Message order within each branch must remain deterministic.

Old branches may be retained or deleted according to the memory level.

A deleted branch must never be presented as recoverable when it no longer is.

### 2.4. Revisions

Editing an old message must not silently alter the retained version.

A revision must have an identity and explicit relationships with its previous version.

When an edit creates a new conversation path, that path is represented by a branch.

Shared content must be physically shared when beneficial.

### 2.5. Interruption

An interaction may be interrupted at any time:

- Before a tool call.
- During a call.
- After a result.
- During generation.
- Before the final response.

The system must retain the operations actually performed within the chosen level's limits.

It must never invent a final response or tool result to artificially complete the history.

---

## 3. Original memory and enriched memory

### 3.1. Original memory

Original memory is the AI's recorded experience.

It may contain:

- Messages.
- AI requests.
- Tool calls.
- Results.
- Permission decisions.
- Observed content.
- Branches.
- Versions.
- Relationships and their timing and order.

The memory level determines how much of this information is retained durably.

**A retained original remains intact.**

A retention policy may authorize its deletion, but never its falsification.

### 3.2. Enriched memory

Enrichment produces additional objects linked to original objects.

Example:

```text
Message M1
  content: "Hello Rémi, how are you today?"

Enrichment E1
  source: M1
  inferred emotion: happy
  intent: greeting
```

The enrichment never replaces M1's content.

During recall, the system may compose:

```text
Original message M1
+
Enrichment E1
```

It must not transform the original message to incorporate the interpretation.

Reinjection must therefore not transform an original greeting into another formulation simply because a consolidation engine reinterpreted it.

### 3.3. Possible enrichments

The system must accommodate different kinds of enrichment:

- Tags.
- Categories.
- Intentions.
- Inferred emotions.
- Expressed preferences.
- Development constraints.
- Decisions.
- Observed facts.
- Hypotheses.
- Corrections.
- Contradictions.
- Relationships between knowledge items.
- General rules.
- Cross-cutting invariants.
- Temporal validity information.
- Provenance.
- Confidence level or verification status.

The structure must remain extensible without requiring all these enrichments for every message.

### 3.4. Provenance and uncertainty

An interpretation is not a certain observation.

Example:

```text
Inferred emotion: happy
```

must not be confused with:

```text
Explicitly declared emotion: happy
```

Memory must distinguish:

- What the user explicitly stated.
- What the tool actually observed.
- What the AI inferred.
- What was confirmed.
- What remains hypothetical.
- What was corrected or invalidated.

Information from an old branch must also retain its historical context.

### 3.5. Evolution of enrichments

An enrichment may be extended, corrected, contradicted or invalidated.

This evolution must be traceable.

New versions or corrections must have their own identities and relationships when needed.

Original data is never modified to reflect a new interpretation.

### 3.6. Enrichments from multiple sources

A knowledge item may derive from several objects.

Example:

```text
Message M1: stated preference
Message M8: confirmation
Message M15: clarification

Knowledge K1
  sources: M1, M8, M15
```

The structure must support multiple source references.

A knowledge item may itself serve as a source for subsequent consolidation.

However, this must not create artificial duplication or chains without value.

---

## 4. Four memory levels

The developer explicitly chooses the level matching their needs and disk budget.

Levels represent retention and consolidation contracts.

They must not be presented as four levels of model intelligence.

### 4.1. Level 1 — Restricted

**Default level.**

Goal: minimal disk footprint while retaining useful, reliable memory within the stated limits.

Characteristics:

- Minimal retention of the session and its active path.
- Old branches may become permanently unrecoverable.
- No exhaustive durable archiving of tool calls and results.
- Lightweight enrichment.
- Important cross-cutting rules and invariants may be retained.
- Information deleted according to the accepted retention policy.

Restricted memory may forget.

This loss must be acknowledged and clearly explained.

Essential rules must not become inaccessible solely because this level is minimal.

### 4.2. Level 2 — Extended

Goal: retain more conversation continuity without archiving tools.

Characteristics:

- All conversation branches are retained as long as the retention policy and the developer's explicit decisions permit.
- More complete message history.
- No durable archiving of tool content.
- More extensive enrichment.
- Retention of cross-cutting invariants.
- Relationships between messages, branches and knowledge.

A storage limit must not cause silent deletion contradicting the stated branch-retention guarantee.

### 4.3. Level 3 — Advanced

Goal: retain conversation information and genuinely useful tool observations.

Characteristics:

- All Extended-level guarantees.
- Selective retention of tool calls and results.
- Selection of relevant observations.
- Detailed provenance for retained items.
- In-depth enrichment.
- Richer relationships between knowledge and observations.

Clearly distinguish tool observations actually retained from those not retained.

Never claim to have a complete result's content if only a selected representation was retained.

### 4.4. Level 4 — Universal

Goal: **retain 100% of recorded experience and consolidate it as fully as possible**.

Characteristics:

- All messages.
- All branches.
- All revisions.
- All tool calls.
- All tool results.
- All content actually observed and transferred to the memory system.
- All relationships, timing and ordering.
- All relevant decisions and interruptions.
- Lossless retention of originals.
- Maximum enrichment and structuring.
- Cross-session relationships.
- Successive consolidations.
- Support for future neurosymbolic mechanisms.

Large content must be fully reconstructible.

Universal retention does not authorize any silent automatic deletion.

Usage may reach several gigabytes or more over time.

This level must be clearly identified as potentially very costly in storage and not recommended by default.

Exhaustiveness concerns information actually received by the system: it does not authorize claims to know data never observed.

### 4.5. Common rule

**Memory quality and honesty must exist at every level.**

Restricted memory may contain reliable enriched information.

Universal memory may contain incorrect hypotheses.

Retained volume and reasoning quality are two different dimensions.

---

## 5. Cross-cutting invariants

Important invariants must be retainable starting at the Restricted level.

Examples:

- An explicitly established development rule.
- A general user preference.
- A naming convention.
- A constraint applying to several projects.
- An explicitly stated prohibition.
- A confirmed global decision.

They must be represented by traceable objects with their own UUIDv7.

They may have:

- Global scope.
- Scope linked to one or more paths.
- Scope linked to a session.
- Conditional scope.
- Temporal validity.
- Sources.
- Validity status.

Do not automatically turn a local decision into a global rule.

Do not present an old invariant as currently applicable if it has been contradicted or replaced.

Invariants must not be an excuse to saturate model context: selection for a given request remains relevant and controlled.

---

## 6. Working paths and development context

### 6.1. No mandatory parent project

Do not create a hierarchy imposing:

```text
Project
  └── Sessions
```

A conversation may concern fifty projects.

Context must be associated with the operations actually concerned.

### 6.2. Path objects

A recognized working path may be a persistent object with a UUIDv7.

It must retain the information needed for identification and contextualization.

Messages, tools, observations and enrichments may reference one or more paths.

Do not invent project membership solely from the folder currently open in VS Code.

### 6.3. Missing paths

An old path may become unavailable because:

- The project was deleted.
- It was moved.
- It was renamed.
- A drive was disconnected.
- The developer is working on another machine.

The system may report that a path is currently unavailable.

It must not automatically infer that the corresponding session is useless or eligible for deletion.

### 6.4. Permissions

An old memory indicating that a file was accessible is not current permission to modify or reread it.

Execution permissions remain governed by the existing permission system.

---

## 7. Persistence and storage architecture

### 7.1. Location

Memory must be stored locally.

No cloud synchronization service is required.

No independent application is required.

Storage must be managed by a clearly identified component within the extension.

Avoid allowing several modules to write freely and simultaneously to the same persistent data.

### 7.2. Durability

Data reported as saved must actually be persisted.

Provide:

- Atomic or transactional writes depending on the storage medium.
- Recovery after interruption.
- Protection against partial writes.
- Object validation on read.
- Disk error handling.
- Schema migration handling.
- Duplicate prevention during recovery.
- Reconstruction of derived indexes when necessary.

VS Code may close abruptly.

Therefore, saving important data must not depend on a single shutdown event.

### 7.3. Logical and physical separation

**An object's domain identity is distinct from the physical representation of its content.**

Example:

```text
ToolResult R1
  UUIDv7: ...
  call: T1
  content: reference to block X

ToolResult R2
  UUIDv7: ...
  call: T2
  content: reference to block X
```

Two distinct results may reference the same content block when their bytes are strictly identical.

Their identities, contexts, timing and order remain distinct.

### 7.4. Target optimizations

Study a combination of:

- Compact binary representation.
- Lossless compression.
- Content deduplication.
- Cryptographic hashes, for example SHA-256.
- Differential storage using deltas when relevant.
- References to shared blocks.
- Efficient indexes.
- Incremental writes.
- Limiting unnecessary physical rewrites.

These optimizations must be assessed against their actual cost.

Binary format alone does not guarantee a substantial reduction.

A SHA-256 hash is not a compression algorithm.

A delta is not necessarily smaller than compressed full content.

### 7.5. File version example

```text
Read 1: 1,000-line file
Read 2: 500-line file
Read 3: back to 1,000 lines
Read 4: 10 lines modified
```

The goal is to reconstruct every retained version exactly without systematically storing four full copies.

The physical engine may use:

- Compressed full content.
- A delta.
- An existing block.
- A combination of these mechanisms.

It must choose a representation consistent with reconstruction guarantees and performance.

Limit excessive dependency chains: retrieving a version must not require endlessly replaying thousands of operations.

### 7.6. Shared reference management

If several sessions or branches use the same physical block, deleting one must not destroy content still needed by others.

Space reclamation must account for actual remaining references.

Distinguish:

- Logical data size.
- Actual physical usage.
- Space actually reclaimable after deletion.

### 7.7. Measurements

The engine must support assessment of:

- Theoretical raw volume.
- Actual occupied volume.
- Compression savings.
- Deduplication savings.
- Delta savings.
- Index cost.
- Enrichment cost.
- Write and reconstruction cost.

Do not claim a guaranteed compression ratio without measurements.

---

## 8. Disk budget and recommendations

### 8.1. Principle

The developer decides the memory budget.

The extension recommends a value based on space actually available on the relevant storage volume.

Do not calculate the budget solely from the SSD's total capacity.

### 8.2. Automatic recommendations

For the first three levels:

| Level      | Percentage of free space |
| ---------- | -----------------------: |
| Restricted |                    0.01% |
| Extended   |                       1% |
| Advanced   |                       5% |

The automatic calculation is capped at **10 GB** for each of these three levels.

Conceptual formula:

```text
recommended_budget =
    min(free_space * level_coefficient, 10 GB)
```

For the Universal level:

- No automatic 10 GB cap.
- Recommendation adapted to available space.
- A safety reserve for the system is essential.
- Explicit warning about potentially massive usage.

### 8.3. Developer freedom

These values are recommendations.

The developer may choose less or more.

Once a budget has been explicitly chosen, it must not be silently replaced whenever disk space changes.

Reduced free space may trigger an alert and a new recommendation.

### 8.4. Limit management

The system must know:

- The authorized budget.
- Actual usage.
- Remaining free space.
- Data eligible for purging.
- Data protected by the selected level.
- Deletion consequences.

Reaching a budget must not cause arbitrary data loss.

At the Universal level, suspend new captures that cannot be guaranteed, notify the developer and do not claim to have recorded absent data.

Do not let a persistence error pass as a successful save.

---

## 9. Session and storage manager

The extension must provide an interface allowing the developer to understand and manage memory.

### 9.1. General information

Display, in particular:

- Currently active level.
- Requested level, if any.
- Authorized budget.
- Physical usage.
- Free disk space.
- Warnings.
- Consolidation status.

### 9.2. Session list

For each session:

- Identity.
- Available title or description.
- Creation date.
- Last activity.
- Branch count.
- Retention level or guarantees applying to the data.
- Estimated logical size.
- Actually reclaimable space.
- Associated paths.
- Availability of these paths.
- Any warnings.

### 9.3. Cleanup suggestions

The system may flag:

- Very old sessions.
- Large sessions.
- Old branches.
- Missing paths.
- Large tool data.
- Archives the developer may no longer need.

These indicators are suggestions, never proof of uselessness.

### 9.4. Deletions

The developer must be able to inspect:

- Sessions eligible for deletion.
- Branches eligible for deletion.
- Secondary content eligible for deletion.
- Reclaimable space.
- Information and relationships that will be lost.
- Affected enrichments.
- Affected cross-cutting invariants.

Manual deletions require explicit agreement.

Automatic deletions are permitted only within the previously accepted memory contract.

A deleted session must actually be deleted according to the chosen policy, rather than secretly retained in another index or enrichment.

Shared references must be handled correctly.

---

## 10. Memory consolidation

### 10.1. Principle

Consolidation progressively enriches available data.

It must not replace or falsify retained originals.

Consolidation is never a prerequisite for using data.

Raw information is immediately available for consultation once saved.

### 10.2. Incremental consolidation

**Information already correctly enriched must not be reanalyzed without a reason.**

Example:

```text
Message M1
  "Hello Rémi, how are you?"

Enrichment E1
  inferred emotion: happy
```

After E1 is created, there is no reason to continually reprocess M1.

Reexamination may be justified by:

- Relevant new information.
- A contradiction.
- A correction.
- A new relationship to establish.
- An explicit reexamination request.
- An engine improvement requiring authorized reevaluation.

Simply reopening VS Code is not a reason to reprocess all memory.

### 10.3. Dependencies

Enrichments know their sources.

When new data appears, the engine searches for potentially affected knowledge.

It must not reexamine all memory unnecessarily.

Dependencies must support targeted reevaluations.

### 10.4. During a conversation

Consolidation may run during an active session.

The main AI may consult enrichments already available.

Data received moments earlier may be enriched and reused within the same session.

A session need not be finished before its information can be consolidated.

Consolidation may also process older data while the main AI works on a new request.

### 10.5. During inactivity

When the extension is active but the main AI is not performing a priority task, the system may perform pending consolidation work.

Inactivity is an execution opportunity, not a trigger for general reanalysis.

### 10.6. Workload

Consolidation must remain lightweight.

It must not:

- Block the conversation.
- Monopolize the CPU or GPU.
- Trigger repetitive full analyses.
- Unnecessarily reread entire sessions.
- Systematically require a second expensive inference.

Prefer short, incremental, interruptible work units.

The developer's experience and the main AI's operations remain the priority.

### 10.7. Interruption and recovery

If VS Code closes:

- Ongoing processing stops.
- Already committed data remains persisted.
- Incomplete work must be resumable later.
- Recovery must not duplicate enrichments.
- Originals remain usable.

### 10.8. Unavailable consolidation

If an enrichment is not yet available, recall simply returns the original data and existing enrichments.

Do not block recall.

Do not invent a missing enrichment.

### 10.9. Enrichment engine

Do not immediately require a specialized AI.

Provide an abstraction allowing several strategies:

- Deterministic extraction.
- Rule-based analysis.
- Contextual analysis by the existing model when relevant.
- A future specialized engine.
- A future neurosymbolic mechanism.

Actually available capabilities must be distinguished from future extensions.

---

## 11. Memory recall and reinjection

### 11.1. Principle

The model must not automatically receive all session history.

Recall must be relevant, selective and controlled.

The goal is to improve the quality of transmitted context without wasting the context window.

### 11.2. Memory search

Provide search capability, including through a tool accessible to the AI.

Illustrative name:

```text
memory.search
```

Criteria may include:

- Text search.
- UUIDv7 identifier search.
- Session.
- Branch.
- Author.
- Time range.
- Working path.
- Category.
- Tags.
- Decisions.
- Invariants.
- Validity status.
- Relationships.
- Original sources.
- Enrichments.

Search must be able to retrieve context around a result, rather than only isolated text.

### 11.3. Tracing provenance

Example:

The AI retrieves an old `read_file` result.

If the data is still retained, it must be able to retrieve:

- The result's UUID.
- The call's UUID.
- The relevant tool.
- Relevant parameters.
- The original user request.
- The session.
- The branch.
- Timing and order.
- Other related operations.
- Any final response.
- Associated enrichments.

It must also be possible to start from a user request and find the operations resulting from it.

### 11.4. Reinjection

Reinjection is controlled composition.

It may contain:

- Original excerpts.
- Enrichments.
- Applicable invariants.
- Tool observations.
- Provenance information.
- Validity or uncertainty indicators.

Originals are never modified to manufacture injected context.

Information from an abandoned or old branch must be identified as such when that distinction matters.

### 11.5. Memory gaps

If an old branch or tool result was deleted, the AI must not claim to retrieve it.

A summary without an available original must not be presented as a verifiable quotation.

Responses must distinguish:

- Available original source.
- Enriched knowledge with an available source.
- Knowledge retained without its original source.
- Missing information.
- Potentially outdated information.

### 11.6. Context limits

The recall engine must respect context budgets.

Avoid unsolicited massive returns.

Allow more details to be retrieved when necessary.

Relevance and provenance guarantees take precedence over the raw quantity injected.

---

## 12. Integration with existing tools

### 12.1. Preserve the current architecture

The extension already has local, remote and MCP tools, as well as a permission system.

Do not rewrite them unnecessarily.

Integrate memory into their existing operation.

The current system includes capabilities for:

- Reading and writing files.
- Searching.
- Exploring directories.
- Executing commands.
- Selecting text.
- Remote HTTP access according to available tools.
- MCP calls.

Actual repository code is authoritative for exact names and interfaces.

### 12.2. Tool traceability

When a call is retained:

- It has its own UUIDv7.
- Its tool identity is known.
- Its actually transmitted parameters are identifiable.
- Its originating request is referenced.
- Its execution has an explicit state.
- Any result has its own UUIDv7.
- The result references the exact call.
- Its timing and order are retained.

Every distinct invocation has its own identity, even for the same tool or parameters.

### 12.3. Result states

Preserve existing distinctions between:

- Success.
- Error.
- Explicit user refusal.
- Cancellation.
- Interruption.
- Unknown or uncertain result.

A denied permission must not be treated as a technical error.

A missing user response must not artificially become a refusal.

A tool that may have executed before an interruption must not be blindly rerun.

### 12.4. Permissions

Retain existing permission modes and mechanisms.

The memory level grants no new permissions over files, commands, network resources or tools.

Memory of an old authorization is not current authorization.

The memory system must respect existing protections and decisions.

### 12.5. Tool result enrichment

Contextual enrichment intended for the AI is cross-cutting.

It is not limited to the graphical interface.

A result may provide:

- Its operation.
- Its resource.
- Its actual status.
- Obtained data.
- Its provenance context.
- Observation limits.
- Information relevant to subsequent reasoning.

The AI must be able to use this information without confusing observation, supposition and authorization.

### 12.6. Tool retention levels

The memory level determines durable archiving:

- Restricted: no durable archiving of full calls and results.
- Extended: no durable tool archiving, but relevant consolidated information is possible.
- Advanced: selection and retention of useful calls/results.
- Universal: exhaustive retention of observed calls and results.

This must not prevent normal tool execution or their use in the immediate conversation context.

---

## 13. User interface

The interface must remain consistent with the existing VS Code extension.

Do not develop an external graphical application.

### 13.1. Memory configuration

Allow inspection and selection of:

- Restricted level.
- Extended level.
- Advanced level.
- Universal level.
- Recommended disk budget.
- Custom budget.
- Current usage.
- Consequences of the selected level.

Restricted is the default level.

Retention commitments must be understandable before activation.

### 13.2. Transparency

Clearly inform the developer about:

- What is retained.
- What is not retained.
- What may be deleted automatically.
- What is permanently lost during a purge.
- What can still be reconstructed.
- The selected level's cost.
- What is enrichment rather than an original observation.

Reliability must not be sold as a guarantee of infinite memory.

### 13.3. Archive management

Provide browsing of sessions and branches with the storage information defined earlier.

The developer must be able to identify old or large archives.

They must be able to make targeted decisions without having to delete all memory.

### 13.4. Consolidation status

The interface may unobtrusively indicate:

- Data awaiting enrichment.
- Consolidation in progress.
- Last committed consolidation.
- Any error.
- Interrupted or resumed processing.

Do not turn this activity into an intrusive interface.

---

## 14. Changing memory levels

### 14.1. Deferred intent

The developer may request a change at any time.

The system distinguishes:

```text
active_level
requested_level
transition_state
```

A request does not imply immediate application.

### 14.2. Consistency

If a conversation, tool call, write or consolidation incompatible with the transition is underway, the change waits for a consistent point.

The system may temporarily suspend new consolidation work to reach that point.

It must not wait indefinitely for all future work to end.

### 14.3. Moving to a higher level

An increase:

- Applies the new guarantees to future data.
- Retains already available data.
- Does not recreate previously deleted data.
- May enable new enrichments from existing sources.
- Must not cause deletion.

The request is applied when the state becomes consistent.

### 14.4. Moving to a lower level

The developer explicitly chooses what to do with existing archives:

1. Retain already saved archives.
2. Inspect data eligible for deletion to reduce usage.
3. Perform targeted cleanup of sessions, branches or content.

Lowering the level does not automatically authorize deletion of historical archives.

### 14.5. Disk context

The system must examine free space and existing archives.

Example:

```text
Memory usage: 50 GB
Free disk space: 50 GB
New requested level: Restricted
```

In this case, highlighting options to free space is relevant.

The recommendation must not become automatic deletion.

### 14.6. Deferred transition and recovery

The request must be persisted.

If VS Code stops before application, it must be resumable at the next activation.

The active level changes only after consistent application.

A failed transition must remain identifiable.

The developer must know the actual state, rather than only the desired level.

### 14.7. Cancellation

A request still pending may be cancelled.

A transition already engaged in a critical operation must reach a consistent state before being considered finished or failed.

---

## 15. Deletion, consistency and provenance

### 15.1. Deleting a session

Complete deletion of a session must examine:

- Branches.
- Messages.
- Retained calls and results.
- Enrichments.
- Relationships.
- Cross-references.
- Shared physical blocks.
- Any derived knowledge.

Do not leave orphan objects presented as verified information.

### 15.2. Derived information

When an original source is deleted:

- Information derived exclusively from that source must be handled according to retention rules and developer choices.
- Information retained without its source must indicate this loss of verifiability.
- Important cross-cutting invariants must not be destroyed inadvertently.
- Knowledge shared across multiple sources must not be deleted without examining its other dependencies.

### 15.3. Physical references

Shared physical content may be deleted only when no retained data references it anymore.

Space reclamation must be consistent and verifiable.

### 15.4. Automatic deletion

It is authorized only for levels and situations where it explicitly forms part of the accepted contract.

No arbitrary deletion of exhaustive Universal history.

Manual destructive actions must be preceded by an intelligible presentation of their consequences.

---

## 16. Lifecycle in VS Code

### 16.1. Chosen architecture

The memory engine belongs to the extension.

It does not depend on a separately installed application.

It does not require a permanent process.

It does not require a system service.

### 16.2. Activation

On extension activation:

- Initialize necessary components.
- Check storage.
- Restore persistent states.
- Make memory available.
- Gradually resume pending work.
- Avoid massive blocking consolidation at startup.

### 16.3. During execution

Memory must be able to:

- Save new data.
- Answer searches.
- Provide enriched context.
- Gradually consolidate earlier information.
- Monitor its disk budget.
- Process pending level changes.

These responsibilities must not cause perceptible extension freezes.

### 16.4. Shutdown

When VS Code and the extension stop, memory processing stops.

The system must be designed for this possibility, including abrupt shutdown.

Do not promise consolidation after closure without specific infrastructure.

That infrastructure is not requested in this phase.

---

## 17. Recommended software architecture

The exact structure must be adapted to the existing repository.

Do not reorganize already working modules without justification.

Clearly separate responsibilities:

### Domain

Definitions of persistent objects:

- Sessions.
- Messages.
- Branches.
- Revisions.
- Retained calls and results.
- Paths.
- Enrichments.
- Knowledge.
- Relationships.
- Memory configurations.

### Storage

Responsible for:

- Serialization.
- Transactions.
- Indexes.
- Physical references.
- Compression.
- Deduplication.
- Deltas.
- Integrity.
- Recovery.
- Migrations.

### Retention

Responsible for:

- Memory levels.
- Retention policies.
- Budgets.
- Authorized deletions.
- Data protection.
- Level transitions.

### Consolidation

Responsible for:

- Identifying relevant new data.
- Creating enrichments.
- Dependencies.
- Targeted reexamination.
- Recovery after interruption.
- Processing priorities.

### Recall

Responsible for:

- Search.
- Information selection.
- Relationship resolution.
- Provenance.
- Composing originals and enrichments.
- Context budgets.
- Reinjection.

### Integration

Responsible for connections with:

- Existing conversation sessions.
- Model providers.
- Tools.
- Permissions.
- MCP.
- VS Code webviews and commands.

These separations are logical. They do not require creating that many processes or as many structures as possible.

Every abstraction must have a concrete responsibility.

---

## 18. Compatibility and migration of existing data

The repository already has conversation functionality and persistence mechanisms.

Examine actual code before any modification.

Preserve:

- Existing user sessions.
- Configurations.
- Autonomy modes.
- The permission system.
- Local tools.
- MCP tools.
- Model providers.
- Existing error messages and structured results.
- Unrelated changes present in the repository.

If data migration is necessary:

- Make it explicit.
- Preserve available data.
- Handle old formats.
- Do not invent provenance links absent from the old format.
- Do not claim old history contains tool observations that were never archived.
- Provide consistent recovery after interruption.

UUIDv7 applies to new domain identities and identities created during migrations, without falsifying the provenance of old data.

---

## 19. Reliability requirements

The system must guarantee the following properties within the selected memory level's limits.

### 19.1. Traceability

Actually recorded relationships must be reliable and verifiable.

### 19.2. Integrity

A retained original must not be modified by consolidation.

### 19.3. Consistency

An interruption must not leave memory in a state incorrectly considered valid.

### 19.4. Recovery

An interrupted operation must be identifiable and resumable when recovery is safe.

### 19.5. Deduplication

Physical sharing must not merge domain identities.

### 19.6. Retention

No deletion incompatible with the chosen level and granted authorizations.

### 19.7. Transparency

The developer must be able to understand the selected level's limits and the consequences of their choices.

### 19.8. Nonblocking operation

Consolidation must not heavily slow extension use.

### 19.9. Memory honesty

The AI must not present a summary, hypothesis or deleted source as a verified original observation.

### 19.10. Respect for permissions

Memory must not be used to bypass a tool permission, user prohibition or access limit.

---

## 20. Implementation strategy

The goal is coherent memory implementation within the current extension.

Do not add a standalone service or artificially postpone the feature to prepare a future distributed architecture.

Do not build a complete neurosymbolic AI in this phase.

Do not settle for a fake memory system that merely saves a few summaries without relationships, provenance or branch management.

The implementation must respect the model's guarantees.

### Mandatory

- Direct integration with BezotCorp AI.
- UUIDv7 for new domain identities.
- Traceable objects and relationships.
- Consistent branches and revisions.
- Enrichments separate from originals.
- Four levels with distinct contracts.
- Reliable persistence.
- Incremental, lightweight, nonblocking consolidation.
- Recall usable during sessions.
- Correct integration with existing tools.
- Configurable disk budget.
- Archive and deletion management.
- Deferred, consistent level transitions.
- Preservation of existing permissions.

### Recommended

- Optimized physical storage.
- Lossless compression.
- Hash-based deduplication.
- Deltas when actually beneficial.
- Dependency-targeted processing.
- Rebuildable indexes.
- Accurate reclaimable-space estimates.
- Ability to evolve the consolidation engine.
- Measurements to improve performance and disk footprint.

### Optional future developments

- Neurosymbolic engine.
- Specialized memory AI.
- Advanced semantic search.
- Cross-machine synchronization.
- Independent memory service.
- Use by other IDEs.
- Universal storage on volumes of several terabytes.

These possibilities must not justify premature complexity.

---

## 21. Working instructions for Claude

1. Examine the repository's actual architecture before modifying code.

2. Identify existing components that can be reused.

3. Preserve user changes unrelated to the requested work, particularly existing configuration and dependency changes.

4. Work on the current branch without creating unrequested branches, commits, pushes or pull requests.

5. Do not unnecessarily replace working components with a new artificial architecture.

6. Do not impose a universal event model if properly linked domain objects satisfy the requirements.

7. Do not create redundant objects or structures representing the same reality.

8. Do not silently modify historical data.

9. Do not invent missing data during migrations.

10. Do not introduce a permanent service or additional application.

11. Respect the existing permission system.

12. Do not add permanent tests without an explicit request. Perform available compilation, formatting and consistency checks, stating precisely what was verified.

13. Do not consider successful compilation sufficient proof of persistence reliability.

14. Explicitly report technical limitations and guarantees not yet satisfied.

15. Prefer a coherent, integrated implementation over a succession of fragmented, contradictory changes.

16. Do not claim a feature is complete if its actual behavior has not been verified.

17. Document technical decisions affecting data durability.

---

## 22. Functional validation criteria

The architecture will be considered coherent if it can satisfy, in particular, the following scenarios.

### Scenario A — Multiple tools

One user request triggers three distinct calls.

Each call has its own UUIDv7.

Every result resolves to its exact call.

The initial request and any final response remain linked to the relevant operations.

### Scenario B — Revised branch

The user edits an old request.

A new conversation path is created.

The old path is not rewritten.

Common objects are shared rather than copied unnecessarily.

### Scenario C — Enrichment

A message has a category and an inferred emotion.

The message content remains unchanged.

New information allows a second emotion to be added or the first corrected.

The history of this evolution remains traceable.

### Scenario D — Consolidation in progress

The AI requests a memory while its enrichment is still being processed.

The system immediately returns the original and already committed enrichments.

No wait for consolidation is imposed.

### Scenario E — New contradiction

An old rule is contradicted by a later statement.

Only affected knowledge is reexamined.

The old rule does not silently disappear from history.

### Scenario F — Restricted

An old branch was purged according to the accepted level.

The system does not claim it can restore it.

Important retained invariants remain usable, with provenance indicated when available.

### Scenario G — Universal

The same file is read many times in different versions.

Each observation remains identifiable.

Retained content can be reconstructed completely.

Physical storage avoids unnecessary duplication as much as possible.

### Scenario H — Level change

A transition is requested during an operation.

The active level remains identifiable.

The transition waits for a consistent state.

The change is applied or reported as impossible, without a partially committed state.

### Scenario I — Disk nearly full

The system detects low free space.

It informs the developer.

It suggests, in particular, old sessions, large data and unavailable paths.

It estimates reclaimable space.

It does not arbitrarily destroy protected archives.

### Scenario J — Abrupt shutdown

VS Code stops during consolidation.

Already committed data remains usable.

Incomplete work is identifiable.

Recovery causes neither corruption nor logical duplication.

### Scenario K — Session deletion

The developer deletes an old session.

Dependencies are examined.

Shared blocks still in use are retained.

Session-specific data is deleted according to the stated guarantees.

Remaining knowledge does not present fictitious provenance.

### Scenario L — Cross-session recall

An old global rule applies to a new request in another session.

The system can retrieve it without injecting all old conversations.

Its scope and status remain verifiable.

---

## Conclusion

BezotCorp AI must have memory structured around a central principle:

**Original data constitutes experience; enrichments build knowledge; relationships, timing and ordering make provenance retrievable.**

The four memory levels allow the developer to choose the tradeoff between retention, enrichment and disk usage that suits them.

Consolidation must be incremental, lightweight and available during conversations.

Recall must be selective, traceable and honest about the limits of what was actually retained.

Everything must operate directly within the VS Code extension without depending on a standalone application.

The goal is more than storing discussions: it is to build durable, extensible, usable memory infrastructure capable of supporting more advanced reasoning later while respecting the developer's resources, permissions and decisions.
