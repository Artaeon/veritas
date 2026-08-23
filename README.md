# Veritas

Veritas is a deterministic knowledge compiler and reasoning runtime. It compiles
a small, typed knowledge language into verified IR, evaluates rules to a
fixpoint, and returns three-valued results with proof traces.

## Start

Requires Node.js 22 or newer.

```bash
npm install
npm test
npm run veritas -- check examples/people.vk
npm run veritas -- explain examples/people.vk john.adult
```

Read the [core architecture](docs/adr/0001-v0.1-core.md) and
[V0.1 language](docs/v0.1-language.md) before extending the engine. The
[semantics contract](docs/semantics-v0.1.md) is normative; the
[hardening report](docs/hardening-v0.1.md) records the V0.1 freeze gate.
