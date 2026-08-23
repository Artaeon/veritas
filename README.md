# Veritas

Veritas is a deterministic knowledge compiler and reasoning runtime. It compiles
a small, typed knowledge language into verified IR, evaluates rules to a
fixpoint, and returns three-valued results with proof traces.

## Start

Requires Node.js 22 or newer.

```bash
npm install
npm test
npm run demo
npm run veritas -- check examples/people.vk
npm run veritas -- explain examples/people.vk john.adult
npm run veritas -- resolve examples/board-game-resolution.vk "move_allowed(turn_alpha)"
npm run veritas -- resolve examples/board-game-resolution.vk "move_allowed(turn_alpha)" --json
```

`npm run demo` starts a short German-language everyday example. It asks whether
cycling to work is possible and translates the resolver's generic blockers into
three ordinary questions. The demo is only a presentation layer; its domain
labels do not enter the reasoning kernel.

Read the [core architecture](docs/adr/0001-v0.1-core.md) and
[V0.1 language](docs/v0.1-language.md) before extending the engine. The
[semantics contract](docs/semantics-v0.1.md) is normative; the
[hardening report](docs/hardening-v0.1.md) records the V0.1 freeze gate.

V0.2 adds goal-directed missing-information resolution without changing V0.1
truth or inference. Its additive contract is
[`docs/semantics-v0.2-resolution.md`](docs/semantics-v0.2-resolution.md), with
gate evidence in [`docs/gate-v0.2.md`](docs/gate-v0.2.md).
