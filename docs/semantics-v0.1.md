# Veritas V0.1 Semantics Contract

- Contract version: `v0.1.0`
- IR version: `1`
- Status: Stable; V0.1 Hardening Gate passed on 2026-08-23

This document is normative for V0.1. If implementation behavior and this file
disagree, the implementation is defective. Changes to these semantics require a
new contract version; they are not compatible bug fixes after the freeze.

## Truth domain

Boolean ground cells carry independent positive and negative support:

| Positive support | Negative support | Result |
|---|---|---|
| absent | absent | `UNKNOWN` |
| present | absent | `TRUE` |
| absent | present | `FALSE` |
| present | present | `CONFLICT` |

Therefore `UNKNOWN != FALSE`, and `CONFLICT` is neither `TRUE` nor `FALSE`.

For a non-Boolean cell, no supported value is `UNKNOWN`, exactly one distinct
value is known, and two or more distinct values are `CONFLICT`. The query
envelope uses status `TRUE` plus `value` for the single-known-value case; this
does not assert that the value itself is Boolean true.

## Open-world assumption

V0.1 is open-world. A missing assertion has no truth value. Failure to prove a
proposition never proves its negation. Given only this rule:

```veritas
rule adult($p: Person):
  when $p.age >= 18
  derive $p.adult = true
end
```

`age = 17` makes `adult` `UNKNOWN`, not `FALSE`. An explicit fact or rule effect
deriving `adult = false` is required to obtain `FALSE`.

## Negation semantics

V0.1 has explicit Boolean false and no negation-as-failure. `property = false`
matches negative support. `property != false` is ordinary typed inequality over
a known value; it does not mean “false is not known.” There is no default or
closed-world negation.

## Rule evaluation semantics

A rule is universally instantiated over every declared entity having its
variable's nominal type. Conditions are a conjunction. For a ground condition
`cell operator literal`:

- it has positive support if at least one supported cell value satisfies the
  typed comparison;
- it has negative support if at least one supported cell value does not;
- it is unknown if the cell has no support;
- it is conflicting if both positive and negative support exist.

A rule fires when every condition has positive support. Contrary support does
not erase positive support. This paraconsistent evidence semantics keeps
inference monotonic and independent of whether contrary evidence appeared
before or after a derivation. Each proof chooses the first canonical matching
support and never cites a non-matching value.

Effects add typed support; they never overwrite or retract support. Rules have
no implicit priority. Declaration order has no semantic effect.

## Fixpoint semantics

Let `F0` be the finite set of asserted ground `(entity, property, value)`
supports. Let `T(F)` be `F` union every literal rule effect whose conditions have
positive support in `F`. Runtime evaluation computes the least fixpoint:

```text
F* = least F such that F = T(F), starting at F0
```

Each round reads an immutable snapshot and merges new support only after all
rule instances in that round are evaluated. This prevents within-round order
from affecting derivation depth or results.

## Conflict semantics

Distinct supported values for one cell are retained. For Boolean predicates,
support for both `true` and `false` yields `CONFLICT`. No support wins.

Conflict propagation is evidence-preserving. A rule requiring `p = true` may
use the positive branch of conflicting `p`; a rule requiring `p = false` may use
the negative branch. If those branches lead to contrary effects, the downstream
cell also becomes `CONFLICT`. This policy is monotonic and proof-producing.

## Equality and ordering

All comparisons are type-strict; V0.1 performs no implicit conversion.

- Boolean, String, Symbol, and Duration support only `=` and `!=`.
- Integer and Decimal support `=`, `!=`, `<`, `<=`, `>`, and `>=`.
- Date supports those six operators over validated `YYYY-MM-DD` values; their
  fixed-width representation has chronological lexical order.
- String equality compares the exact Unicode scalar sequence. Veritas rejects
  unpaired UTF-16 surrogates and performs no Unicode normalization.
- Symbol equality is exact and case-sensitive.
- Duration equality is exact token equality. Duration ordering is rejected
  because calendar durations do not have context-free total order.

## Numeric semantics

Integer literals are signed arbitrary-precision integers backed by `BigInt`.
Decimal literals are finite base-10 values represented as a signed integer plus
a decimal scale. Comparison aligns scales with arbitrary-precision integer
arithmetic. No numeric fact, condition, hash, or query passes through JavaScript
`Number` or IEEE-754 floating-point arithmetic.

Canonical integers have no leading plus sign or redundant zeroes. Canonical
decimals have no leading plus sign, no redundant leading/trailing zeroes, and
retain `.0` for integral decimal values. Thus `1.0` and `1.000` are equal and
serialize identically; Integer `1` and Decimal `1.0` remain different types.
Exponent notation, `NaN`, and infinities are invalid.

## Termination assumptions

V0.1 declares a finite set of entities and properties. Rule effects are literals
and cannot create entities, properties, rules, or computed values. The possible
support universe is finite, and monotonic fixpoint evaluation terminates even
with cycles.

Deterministic resource ceilings may abort evaluation before the mathematical
fixpoint for an accepted but excessively expensive bundle. Such an abort is an
explicit `ResourceLimitError`, never a partial query result.

## Proof semantics

Every returned support has a root proof. An asserted proof contains its complete
ground conclusion and source fact ID. A derived proof contains its complete
ground conclusion, rule ID, entity substitution, and for every condition:

- property and operator;
- expected literal;
- actual observed matching value;
- supporting proof ID.

Only premises used by the runtime are present. Proofs form a directed acyclic
graph because every derivation reads the preceding round's snapshot. The
independent `verifyProof` checker replays comparisons against compiled IR,
checks conclusions and substitutions, rejects cycles/unreachable nodes, and
recomputes query status from its roots.

## Determinism guarantees

Given identical source bytes, file identity used in diagnostics/provenance,
query bytes, Veritas engine version, and resource limits:

- compilation diagnostics have identical order and content;
- canonical IR and SHA-256 identity are identical;
- runtime result, selected proof, and formatted output are byte-identical;
- behavior is identical across fresh Node.js processes on the supported engine.

No runtime path uses wall-clock time, randomness, network access, filesystem
access, locale collation, ambient mutable state, or user code execution.

## Canonicalization and hash semantics

The bundle hash is SHA-256 over canonical JSON of typed IR. Canonical JSON sorts
object keys by deterministic UTF-16 code-unit order. Semantic collections are
sorted by stable semantic keys:

- types by name;
- properties by owner and name;
- entities by name;
- facts by entity, property, and typed value;
- rules by name;
- conjunctive conditions by property, operator, and typed literal.

Stable IDs are assigned after sorting. Source names and locations, comments,
whitespace, and declaration/conjunction ordering are excluded from the hash.
Bundle name/version, names, types, values, facts, and rule meaning are included.
Duplicate declarations remain errors. Duplicate identical facts remain distinct
asserted provenance and are not silently discarded by compilation.

The compiler recursively freezes the complete verified IR after hashing. This
prevents runtime mutation from separating executed meaning from bundle identity.

## Deterministic resource contract

V0.1 rejects or aborts beyond these fixed ceilings:

| Resource | Limit |
|---|---:|
| UTF-8 source size | 1,048,576 bytes |
| Source lines | 20,000 |
| Line length | 16,384 UTF-16 code units |
| Declarations | 10,000 |
| Conditions per rule | 256 |
| Diagnostics returned | 100 |
| Digits per numeric literal | 4,096 |
| Fixpoint rounds | 10,000 |
| Rule instantiations per query | 1,000,000 |
| Pending effects in one round | 100,000 |
| Newly derived supports per query | 100,000 |

The parser is iterative and the DSL has no recursive nesting construct. Runtime
cost before a limit is approximately `rounds * rules * matching_entities *
conditions`; proof memory is proportional to retained supports reachable from
the queried result. The CLI reads a file into memory before source-size
validation, so operating-system and file-I/O limits remain an outer boundary.
