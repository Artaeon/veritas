# ADR 0002: Goal-Directed Missing-Information Resolution

- Status: Accepted for V0.2 implementation
- Date: 2026-08-23
- Depends on: frozen V0.1 semantics (`v0.1.0`)

## Context

V0.1 can prove a ground query or return `UNKNOWN`, but an unknown result does not
explain which absent inputs lie on viable derivation paths. V0.2 must analyze
that question without changing forward inference, inventing closed-world
negation, adding domain vocabulary, or making probabilistic choices.

## Decision

Add a read-only `resolver` module above compiled IR and the V0.1 evaluator. It
performs backward, goal-directed analysis over grounded rule dependencies. It
does not add facts, fire rules, mutate IR, or change query truth.

The dependency direction is:

```text
compiled V0.1 IR + V0.1 evaluation result
                    ↓
          V0.2 dependency resolver
                    ↓
 machine-readable resolution trace + deterministic formatter
```

Rules producing a requested ground value are alternative OR paths. Conditions
inside one rule are an AND path. Unknown conditions recursively become goals.
When no rule can produce a required matching value, the unknown ground cell is
an askable blocking fact. Cycles are path-local and never treated as facts.

The resolver returns all traced alternatives and subset-minimal blocker
frontiers. It does not choose a preferred domain strategy. Stable semantic keys
order every result collection.

## Consequences

- V0.1 truth, conflict, proof, hashing, and fixpoint behavior remain normative
  and unchanged.
- “Can resolve” is relative to the V0.2 admissible-input policy: only cells with
  no current support and no matching producer rule are askable leaves.
- A false condition makes its rule path impossible; absent facts elsewhere on
  that same AND path are traced but irrelevant to the present resolution.
- Conflicting evidence can satisfy a condition through its matching branch,
  exactly as in V0.1; the trace also records contrary support.
- Pure recursion without a viable leaf is unresolvable.
- This is dependency analysis, not constraint solving. Requirements on blockers
  are retained as typed operators/literals rather than solved or ranked.
