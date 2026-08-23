# Contributing to Veritas

Thank you for helping improve Veritas. Correct semantics, reproducibility, and
small reviewable changes take priority over feature volume.

## Before starting

- Use Node.js 22 or newer.
- Search existing issues and pull requests before proposing substantial work.
- Discuss changes to syntax, IR, truth semantics, canonicalization, or proof
  behavior before implementation.
- Report vulnerabilities according to [SECURITY.md](SECURITY.md), not in a
  public issue.

## Local setup

```bash
npm ci
npm run gate:v0.2
```

The gate performs strict TypeScript checking, the complete test suite, and an
npm vulnerability audit.

## Change requirements

Every contribution should:

1. have one clear purpose;
2. include tests for observable behavior;
3. preserve deterministic ordering and serialization;
4. avoid clocks, randomness, network access, locale-sensitive ordering, and
   hidden global state in semantic execution;
5. fail explicitly at resource ceilings instead of returning partial semantic
   results;
6. update normative or explanatory documentation when behavior changes.

Do not place domain-specific vocabulary or question-selection policy in the
kernel. Domain behavior belongs in knowledge code or an external presentation
layer.

## Semantics compatibility

The contract in [`docs/semantics-v0.1.md`](docs/semantics-v0.1.md) is frozen at
`v0.1.0`. Do not alter it to simplify a later feature. New behavior must be an
additive, versioned layer with its own specification, architecture decision,
adversarial tests, and gate report.

Changes that affect canonical serialization or hashes require explicit
compatibility analysis. A formatting-only change must not silently alter
semantic identity.

## Tests

Use focused tests during development and run the full gate before opening a pull
request:

```bash
npm run check
npm test
npm run gate:v0.2
```

Tests involving determinism should compare byte-identical output in fresh
processes as well as repeated execution in one process. Proof tests should use
the independent proof checker instead of trusting explanatory formatting.

## Commits and pull requests

- Keep commits logically scoped and write imperative commit subjects.
- Explain the problem, semantic consequences, and verification performed.
- Call out compatibility changes and known limitations explicitly.
- Never commit credentials, personal datasets, generated dependency folders,
  or build output.

By contributing, you agree that your contributions are licensed under the
Apache License 2.0.
