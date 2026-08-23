# V0.1 Hardening Gate Report

- Gate date: 2026-08-23
- Result: **PASS**
- Contract: `docs/semantics-v0.1.md`
- Release recommendation: ready to commit and tag as `v0.1.0`

No V0.2 capability, TUI work, LLM integration, or product feature was added.
Changes are limited to formalization, correctness fixes, defensive limits,
proof verification, tests, and one knowledge-only generalization example.

## Scope checked

- Four-state truth and open-world behavior, especially `UNKNOWN != FALSE`.
- Explicit negation and absence of negation-as-failure.
- Monotonic fixpoint and conflict behavior at different derivation depths.
- Canonical serialization under object, declaration, fact, rule, and conjunction
  reordering where order has no meaning.
- Fresh-process hash, result, proof, formatting, and locale independence.
- Exact large Integer and Decimal comparison without IEEE-754.
- Invalid numeric forms, date validity, and Duration operator restrictions.
- Malformed, deeply shaped, oversized, token-hostile, and Unicode input.
- Long chains, seeded/unseeded cycles, broad entity/rule sets, and deep conflicts.
- Proof soundness using an independent replay checker and deliberately tampered
  proof graphs.
- Immutability of verified IR after hashing.
- Dependency vulnerability audit.
- A previously unseen electrical-protection domain expressed only in `.vk`.

## Weaknesses found and corrected

### Conflict timing affected downstream derivation

The original runtime blocked a rule when a premise was already conflicting, but
did not retract a conclusion if contrary premise support arrived later. The
result could therefore depend on derivation depth. V0.1 now has explicit
paraconsistent evidence semantics: a matching positive branch remains usable,
contrary branches are retained, and downstream conflicts propagate monotonically.

### Proof traces were descriptive but not independently checkable

Asserted proof nodes contained only IDs/locations, and derived conditions were
formatted strings. Proof nodes now carry ground conclusions, observed and
expected typed values, operators, substitutions, and exact support IDs. The new
`verifyProof` checker independently replays the proof against compiled IR and
rejects fabricated values, missing support, wrong effects, cycles, duplicate
roots, unreachable narration, status/value mismatches, and bad provenance.

### Invalid ordering semantics for Duration

Relational Duration comparisons would have used lexical ordering, which is not a
valid context-free ordering for calendar durations. V0.1 now permits only exact
equality/inequality and rejects relational operators.

### Date validation accepted impossible calendar dates

Dates previously passed format checks even when the day did not exist. Calendar
validation now handles month lengths and Gregorian leap-year rules.

### Locale-sensitive sorting remained in deterministic paths

`localeCompare` was replaced with explicit UTF-16 code-unit comparison. Cross-
process tests run under different locale environment values and remain identical.

### Canonical conjunction and runtime mutability gaps

Conjunctive condition order is now canonicalized because conjunction is
commutative in V0.1. The complete verified IR is recursively frozen after its
hash is calculated so executed meaning cannot diverge from bundle identity.

### Resource behavior was unbounded and undocumented

Deterministic ceilings now cover source bytes, lines, line length, declarations,
rule conditions, diagnostic count, numeric digits, fixpoint rounds, rule
instantiations, pending effects, and derived support. Exceeding a ceiling returns
a compiler diagnostic or throws an explicit `ResourceLimitError`; no partial
query result is returned. The exact limits are normative in the semantics file.

### Grammar accepted ambiguous statement order

The parser now requires the bundle header first, `when` before `and`, conditions
before the effect, and exactly one effect position. Malformed ordering fails
loudly instead of compiling to an accidental interpretation.

### Unicode and Duration lexical edge cases

Valid Unicode scalar strings round-trip. Unpaired surrogates are rejected.
Malformed Duration tokens such as a trailing empty time section are rejected.

## Test inventory

The gate currently runs 45 top-level automated tests. Those tests include:

- 10 valid and 10 invalid checked-in knowledge files;
- 20 baseline query outcomes;
- explicit tests for all four truth states and open-world counterexamples;
- initial, late, numeric, downstream, and 100-level conflict cases;
- 300-rule proof-producing chains and 200-rule cycles;
- 100 entities across a 30-rule inference depth;
- 1,500 entities plus 1,500 facts in a flat large-file case;
- 300 deterministic malformed-input corpus samples;
- every parser/compiler resource ceiling that can be reached at compile time;
- 300-digit Integer and Decimal comparisons and the 4,096-digit boundary;
- recursive proof replay plus multiple deliberate proof corruptions;
- 100 repeated in-process evaluations;
- 12 completely fresh worker processes under alternating locale settings;
- two separate end-to-end CLI processes with byte-identical output;
- canonical hash equivalence and semantic-change separation;
- deep verified-IR immutability;
- electrical-protection generalization with a source scan proving that its domain
  vocabulary does not occur in `src/`.

Run the complete gate with:

```bash
npm run hardening
```

## Unseen-domain result

`examples/electrical-protection.vk` defines circuits, voltage/current facts,
energization, overcurrent classification, and trip requirements. The test
correctly derives:

- workshop branch trip required: `TRUE`;
- lighting branch overcurrent: `FALSE`;
- lighting branch trip required: `UNKNOWN`;
- unmeasured branch trip required: `UNKNOWN`.

No kernel file was changed to add or recognize electrical concepts. An automated
guard scans every `src/*.ts` file for the domain vocabulary. The generalization
test therefore passed entirely through knowledge code.

## Known V0.1 limits

- The trusted runtime accepts compiler-produced IR. A JavaScript caller can
  deliberately forge an object with a `KnowledgeIR` structural type; serialized
  IR loading and cryptographic revalidation are not V0.1 features.
- Determinism is certified across fresh processes of the supported Node.js 22
  engine. Cross-engine and cross-version byte identity is not yet certified.
- A proof returns one deterministic sound derivation per supported value, not
  every alternative derivation or a globally minimal proof.
- The CLI reads a complete file before the parser applies its 1 MiB ceiling.
  OS/process-level file and memory controls remain an outer boundary.
- Resource ceilings can reject a mathematically terminating but expensive
  bundle. This is an explicit deterministic failure, not `UNKNOWN`.
- Decimal syntax is finite base-10 only; exponent notation is intentionally
  unsupported. Duration has equality only. Unicode is not normalized.
- V0.1 has one rule variable, unary entity properties, literal effects, and no
  relations, units, imports, computed values, or solver.
- Missing-information output identifies the unresolved query cell, not a minimal
  prerequisite question set. That remains outside the frozen V0.1 contract.
- Bundle hashes identify canonical knowledge IR only. Decision identity that
  also binds engine version, inputs, and evaluation context remains future work.

## Freeze decision

The gate passes. The kernel is generic within the declared V0.1 language, the
unseen-domain test passed without kernel adaptation, all known semantic defects
found during this gate were corrected, and the remaining limits are explicit.

V0.1 is ready to freeze and tag as `v0.1.0`. After tagging, changes to any
behavior in `docs/semantics-v0.1.md` require a new contract version. The tag has
not been created by this gate because release tagging should point to an explicit
user-approved commit.
