# Changelog

All notable changes to Veritas are documented in this file. The project follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html) for tagged contracts.

## Unreleased

### Added

- Apache-2.0 licensing.
- A guided German-language bicycle commute demo.
- Procurement approval and bicycle commute knowledge examples.
- Regression coverage for the new examples and presentation layer.

## 0.2.0 - 2026-08-23

### Added

- Deterministic goal-directed missing-information resolution as an additive
  layer over the frozen V0.1 kernel.
- Machine-readable resolution traces, relevant blockers, irrelevant unknowns,
  alternative paths, and subset-minimal blocker sets.
- Adversarial, recursion, conflict, unseen-domain, and cross-process resolver
  tests.
- A normative V0.2 resolution semantics document and implementation gate.

### Changed

- Runtime evaluation materializes one immutable fixpoint snapshot per request so
  dependency analysis does not repeatedly recompute closure.

## 0.1.0 - 2026-08-23

### Added

- Typed knowledge language, compiler, canonical IR, deterministic fixpoint
  runtime, four-valued query results, and independently verifiable proofs.
- Exact integer and finite-decimal comparisons.
- Explicit resource limits and adversarial parser/compiler coverage.
- Cross-process determinism and canonicalization tests.
- Normative V0.1 semantics and hardening documentation.

### Security

- V0.1 passed its hardening gate and is frozen at Git tag `v0.1.0`.
