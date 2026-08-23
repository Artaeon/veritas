# V0.2 Goal-Directed Resolution Gate

- Gate date: 2026-08-23
- Result: **PASS**
- Base kernel: immutable Git tag `v0.1.0`
- Additive contract: `docs/semantics-v0.2-resolution.md`

## Outcome

V0.2 adds a deterministic, goal-directed missing-information resolver over
compiled V0.1 IR. An unresolved query now returns:

- relevant missing ground facts and primitive types;
- typed requirements that explain why each fact matters;
- subset-minimal blocker frontiers for alternative derivation paths;
- complete grounded rule/condition paths;
- satisfied, false, unknown, conflicting, impossible, and cyclic states;
- unknowns that occur only on presently impossible paths;
- the unchanged V0.1 query result/proof and knowledge hash.

The result is deeply immutable and directly machine-readable. The CLI exposes
human output and canonical JSON through `resolve ... [--json]`.

## Semantics implemented

- Rules producing a goal are OR alternatives; conditions are AND requirements.
- Only entirely unsupported cells are admissible missing inputs.
- Existing non-matching evidence makes a condition `FALSE`; it is never confused
  with absence.
- Conflicting evidence remains usable through a matching positive branch while
  contrary proof IDs stay visible.
- Producer dependencies expand recursively until support, false evidence, an
  askable leaf, or a path-local cycle is reached.
- Pure cycles have no blocker and are structurally unresolvable.
- Unknown leaves on an impossible AND path are marked irrelevant and excluded
  from viable blocker sets.
- Blocker frontiers are deduplicated and minimized by cell-set inclusion without
  domain ranking or hidden priority.

## Defects found during implementation

The initial correct prototype recomputed the entire forward fixpoint for every
visited dependency cell. That created avoidable CPU amplification on large
graphs. The runtime was semantics-preservingly factored into one materialized
V0.1 snapshot plus read-only cell queries; the resolver now computes closure
once per request. All frozen V0.1 regression tests continued to pass unchanged.

The package lock also still contained the obsolete early CLI binary path even
though `package.json` was correct. V0.2 metadata regeneration corrected it to
`dist/src/cli.js`.

## Test coverage

The complete suite contains 63 top-level tests, including all 45 V0.1 hardening
tests. V0.2-specific coverage includes:

- nested SME-style dependencies and typed Decimal blockers;
- multiple OR paths and subset-minimal frontier removal;
- conjunctions requiring several facts and several constraints on one cell;
- explicit false-producing paths and literal attribute producers;
- false siblings with irrelevant unknown facts;
- pure recursion and recursion with a finite exit;
- intermediate and root conflicts;
- base-cell queries and already resolved TRUE/FALSE/CONFLICT queries;
- 100 repeated in-process resolution traces;
- 12 fresh processes under alternating locale settings;
- separate human and canonical-JSON CLI runs;
- reordered rules producing identical resolution JSON;
- 100 impossible alternatives beside one viable path;
- deterministic alternative-frontier, dependency-depth, and trace-node limits;
- stable golden human output;
- unseen board-game rules with a source scan excluding all domain vocabulary
  from the kernel.

Run the gate with:

```bash
npm run gate:v0.2
```

## Unseen-domain result

`examples/board-game-resolution.vk` defines turn state and two alternative move
rules entirely in knowledge code.

For `move_allowed(turn_alpha)`, V0.2 returns two minimal alternatives:

```text
turn_alpha.bonus_card
OR
turn_alpha.path_clear
```

For `turn_blocked`, the standard move branch is impossible because `roll = 0`;
its unknown `path_clear` is explicitly irrelevant. The bonus branch remains
viable and asks only for `bonus_card`.

No board-game term occurs in `src/`. No kernel adaptation was made.

## Known limits

- Resolution is structural dependency analysis, not value synthesis, question
  wording, ranking, cost optimization, or constraint solving.
- Minimality is subset-minimal over ground cell IDs, not a globally cheapest
  information-acquisition strategy.
- Several requirements on one cell are retained. V0.1 may need multiple
  supported values if no single value satisfies all of them.
- The admissible-input policy asks only about wholly unknown cells. It does not
  propose overriding, deleting, or repairing false/conflicting evidence.
- A property with at least one matching producer is expanded as derived
  knowledge; the resolver does not bypass that producer by asking directly for
  the derived result.
- Results stopped by a deterministic resolution ceiling fail explicitly rather
  than returning a partial blocker claim.
- The analysis inherits V0.1's one-variable, unary-property IR. Relations and
  multi-entity joins remain outside both contracts.

## Scope guard

No CNL, LLM, GUI/TUI enhancement, external data import, domain-specific question
logic, or domain-specific kernel behavior was introduced.
