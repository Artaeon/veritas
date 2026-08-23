# Veritas V0.2 Resolution Semantics

- Layer version: `v0.2`
- Status: Implemented; V0.2 gate passed on 2026-08-23
- Base contract: `docs/semantics-v0.1.md` at tag `v0.1.0`

This document defines an additive analysis layer. It does not modify V0.1 truth,
rule firing, fixpoint, conflict, proof, equality, numeric, or hash semantics.

## Purpose

For a ground query, V0.2 first obtains the exact V0.1 result. If it is
`UNKNOWN`, the resolver explains which currently unsupported ground cells occur
on viable backward derivation paths and why providing them could make progress.

The resolver is counterfactual analysis over compiled IR. It never asserts a
fact and never changes the V0.1 result returned alongside its trace.

## Terms

### Ground cell

A pair `(entity, property)` whose entity and property exist in compiled IR.

### Requirement

A typed predicate over one ground cell:

```text
cell operator literal
```

The root query uses the special requirement `KNOWN`, satisfied by any supported
value. Rule conditions use their compiled typed operator and literal.

### Producer

A grounded rule instance is a producer for a requirement when its effect targets
the same cell and its literal effect satisfies the requirement. Producer
matching uses the exact V0.1 comparison semantics.

### Blocking fact

A blocking fact is a ground cell that:

1. currently has no V0.1 support;
2. is required by a condition on a currently viable path; and
3. has no compiled producer whose effect can satisfy that requirement.

It is an askable leaf, reported with its primitive type and every typed
requirement that justified it. The queried cell itself may be a blocker when it
is a base property with no producer. A cell with existing false or conflicting
support is not a missing fact.

### Resolvable query

An `UNKNOWN` query is structurally resolvable when at least one finite producer
path reaches only satisfied conditions and blocking-fact leaves. Supplying facts
that satisfy every recorded requirement in one returned blocker frontier would
make that path capable of producing support, assuming no existing fact is
removed and resource limits are not exceeded.

This is structural resolvability, not a promise that a human can obtain the data.
`TRUE`, `FALSE`, and `CONFLICT` queries are already decided or contradictory and
therefore do not request missing information.

### Alternative proof path

All grounded rules whose effects satisfy the same goal are OR alternatives.
Conditions within one grounded rule are AND requirements. The resolution trace
retains every alternative; it never silently selects one rule or assigns
priority.

### Blocker frontier

A blocker frontier is the set of ground cells that must receive matching support
to complete one currently viable producer path. AND nodes form deterministic
Cartesian unions of child frontiers. OR nodes concatenate alternatives.
Duplicate frontiers and strict supersets are removed. The remaining collection
is the subset-minimal family, ordered canonically.

If the same cell carries several requirements, it appears once in a frontier and
all requirements remain attached to the blocker/trace. V0.1 permits multiple
supports for a cell; V0.2 does not solve whether one value can satisfy every
constraint.

## Condition classification

The resolver evaluates every rule condition against the completed V0.1
fixpoint. It records both cell evidence and requirement evidence:

- `SATISFIED`: at least one known support matches and no contrary support exists.
- `CONFLICT`: matching and non-matching support both exist. The condition is
  usable through the matching branch under V0.1 paraconsistent semantics.
- `FALSE`: support exists, but none matches. Under the admissible-input policy,
  this branch is presently impossible because only wholly unknown cells may be
  supplied.
- `UNKNOWN`: the cell has no support and requires recursive producer analysis or
  becomes a blocking fact.

`FALSE` is not inferred from absence. It always requires existing non-matching
evidence. This preserves `UNKNOWN != FALSE`.

## Rule-path classification and short-circuiting

Every condition is analyzed for trace completeness; evaluation order cannot hide
unknowns. After all conditions are classified:

- `SATISFIED`: every condition is `SATISFIED` or usable `CONFLICT`;
- `BLOCKED`: no condition is impossible/cyclic, and at least one condition has a
  finite blocker frontier;
- `IMPOSSIBLE`: at least one condition is `FALSE` or has no finite resolution;
- `CYCLIC`: the path depends on an active ancestor goal and has no independent
  finite exit on that path.

If an AND path is `IMPOSSIBLE` or `CYCLIC`, unknown facts found only under that
path are marked `IRRELEVANT` and excluded from global blockers/frontiers. They
remain visible in the machine trace. This is analytical short-circuiting after
complete inspection, not order-dependent runtime short-circuiting.

At an OR goal, every producer path is traced. One blocked finite path is enough
for structural resolvability. Impossible and cyclic alternatives do not make
unknowns on viable alternatives irrelevant.

## Nested dependencies

For an unknown condition, the resolver grounds producer rules to the same
entity. A producer effect must satisfy the exact condition requirement. The
resolver then analyzes that producer's conditions recursively. This continues
until it reaches current matching support, a blocking fact, a false branch, or a
cycle.

No domain concept, question template, preferred source, or property name affects
this traversal.

## Recursion

The active goal key consists of entity, property, operator, and typed expected
value (or `KNOWN`). Encountering the same key on the current path produces a
`CYCLIC` trace node. A cyclic alternative does not invalidate a separate finite
alternative. Pure recursive components with no supported seed and no askable
leaf are not structurally resolvable.

## Conflict semantics

V0.2 reuses V0.1 positive paraconsistent support:

- if a conflicting cell contains a matching value, the condition is usable and
  its canonical matching proof ID is recorded;
- contrary proof IDs are also recorded so contradiction is never hidden;
- if no conflicting value matches, the condition is `FALSE` for that path;
- a root `CONFLICT` query returns conflict evidence and no missing blockers.

The resolver never recommends removing or overriding evidence. Conflict repair
is outside V0.2.

## No-resolution cases

An `UNKNOWN` query is not structurally resolvable when it has producers but every
producer path is impossible or purely cyclic. It is also unresolvable if fixed
resolution limits prevent complete analysis. The result distinguishes
`UNRESOLVABLE` from `LIMIT_EXCEEDED`; neither is reported as `FALSE`.

## Machine-readable result

The stable result contains:

```text
ResolutionResult {
  query
  queryStatus: TRUE | FALSE | UNKNOWN | CONFLICT
  resolutionState: ALREADY_RESOLVED | RESOLVABLE | UNRESOLVABLE | CONFLICT
  blockers[]
  irrelevantUnknowns[]
  minimalBlockerSets[][]
  paths[]
  queryProof
  knowledgeHash
}
```

Every blocker has a canonical cell ID, entity, property, primitive type, and
typed requirements. Every path/condition node has a stable state, grounded rule
identity, evidence proof IDs, optional blocker identity, optional nested paths,
and explicit relevance. Arrays and blocker sets use code-unit ordering.

## Determinism and limits

Resolution uses no randomness, time, locale collation, I/O, or mutable global
state. For identical compiled IR and query, JSON and formatted output are
byte-identical across supported fresh processes.

The V0.1 forward fixpoint is materialized once per resolution request and reused
for every backward cell inspection. Resolution does not repeatedly execute the
rule closure for each dependency node.

V0.2 adds deterministic ceilings of 256 dependency levels, 10,000 trace nodes,
and 1,024 alternative blocker frontiers. Exceeding one produces an explicit
resolution limit result/error and never a partial claim of resolvability.
