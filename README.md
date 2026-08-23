# Veritas

Veritas is an experimental deterministic knowledge compiler and reasoning
runtime. It compiles a small typed knowledge language into canonical IR,
evaluates rules to a fixpoint, and returns reproducible results with proof and
missing-information traces.

The kernel contains no domain vocabulary. People, policies, electrical
protection, board games, and other domains are expressed entirely as knowledge
code.

## Project status

Veritas is a research and engineering prototype, not a finished end-user
product. V0.1 is a frozen semantics contract tagged as `v0.1.0`. V0.2 adds a
goal-directed resolver without changing that contract.

The implementation is covered by 66 top-level tests, including adversarial
input, exact numerics, proof soundness, recursion, conflicts, resource ceilings,
canonical hashing, and determinism across fresh processes.

Do not use Veritas as the sole basis for medical, legal, financial,
safety-critical, or other high-impact decisions. It is not certified for those
uses, and correctness of a result still depends on correctness and completeness
of the supplied knowledge.

## Current capabilities

- typed entities, attributes, predicates, facts, and rules;
- exact integers and finite decimals without IEEE-754 comparison drift;
- deterministic least-fixpoint evaluation;
- four-valued results: `TRUE`, `FALSE`, `UNKNOWN`, and `CONFLICT`;
- paraconsistent open-world semantics: absence is not false, and conflict does
  not cause explosion;
- complete transitive proof traces with an independent proof checker;
- canonical serialization and SHA-256 knowledge identity;
- goal-directed analysis of unresolved queries;
- relevant blockers, irrelevant unknowns, impossible paths, cycles, and
  subset-minimal alternative blocker sets;
- canonical machine-readable JSON output;
- explicit parser, compiler, runtime, and resolver resource limits.

## Deliberate limitations

V0.2 has no natural-language understanding, LLM integration, GUI, database,
external data import, network access, full-text search, entity relations,
multi-entity joins, aggregation, or domain-specific recommendations. Its IR is
currently limited to one-variable rules over unary properties.

The resolver performs structural dependency analysis. It does not synthesize
values, rank questions by business cost, repair conflicting evidence, or invent
facts.

## Requirements

- Node.js 22 or newer
- npm with lockfile support

Install exact dependencies and run the full verification gate:

```bash
npm ci
npm run gate:v0.2
```

## Friendly demo

Start the German-language everyday example:

```bash
npm run demo
```

The demo asks whether cycling to work is possible and translates generic
resolver blockers into three ordinary questions. Its labels live only in the
presentation script; the kernel remains domain-independent.

For reproducible, non-interactive runs:

```bash
npm run demo -- --answers=j,j,j
npm run demo -- --answers=n
npm run demo -- '--answers=?,?,?'
```

## Knowledge example

```text
bundle people@0.1.0

type Person
attribute Person.age: Integer
predicate Person.adult

entity john: Person
fact john.age = 21

rule adult_age($person: Person):
  when $person.age >= 18
  derive $person.adult = true
end
```

Compile and query it:

```bash
npm run veritas -- check examples/people.vk
npm run veritas -- explain examples/people.vk john.adult
```

Analyze missing information and request canonical JSON:

```bash
npm run veritas -- resolve examples/board-game-resolution.vk \
  "move_allowed(turn_alpha)"

npm run veritas -- resolve examples/board-game-resolution.vk \
  "move_allowed(turn_alpha)" --json
```

## CLI

```text
veritas check   <knowledge.vk>
veritas run     <knowledge.vk>
veritas query   <knowledge.vk> <query>
veritas explain <knowledge.vk> <query>
veritas resolve <knowledge.vk> <query> [--json]
```

- `check` compiles and validates a bundle.
- `run` opens the minimal interactive query shell.
- `query` returns the four-valued result.
- `explain` adds the runtime proof trace.
- `resolve` explains why a query is unresolved and which unknown facts could
  make progress.

## Architecture

```text
Knowledge source
      ↓
Parser → AST → semantic compiler → canonical typed IR
                                      ↓
                           deterministic fixpoint runtime
                                      ↓
                   result + proof + resolution analysis
```

Semantic execution has no clock, randomness, network access, locale-dependent
ordering, or hidden mutable global state. Identical inputs, engine version, and
evaluation context are intended to produce byte-identical outputs.

## Documentation

- [V0.1 normative semantics](docs/semantics-v0.1.md)
- [V0.2 resolution semantics](docs/semantics-v0.2-resolution.md)
- [V0.1 language reference](docs/v0.1-language.md)
- [V0.1 hardening report](docs/hardening-v0.1.md)
- [V0.2 gate report](docs/gate-v0.2.md)
- [Core architecture decision](docs/adr/0001-v0.1-core.md)
- [Resolver architecture decision](docs/adr/0002-goal-directed-resolution.md)
- [Changelog](CHANGELOG.md)

Normative semantics take precedence over examples and explanatory prose.

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing syntax, IR, semantics,
proofs, canonicalization, or resource limits. Community participation is
governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

Report vulnerabilities privately according to [SECURITY.md](SECURITY.md). Do
not place exploit details, credentials, personal data, or private knowledge
bundles in public issues.

## License

Licensed under the [Apache License 2.0](LICENSE).
