# Research Notes

## Open-world negation

V0.1 permits explicit Boolean false but has no negation-as-failure. Later work
must decide whether non-monotonic rules belong in a separate, stratified layer.

## Contradiction handling

Conflicts retain all support and block rules whose premises depend on the
conflicting cell. Future policies may interpret conflicts, but policy must be
explicit knowledge rather than hidden runtime priority.

## Decidability and termination

Literal-only effects over a finite set of declared entities and properties make
the V0.1 closure finite. Relations, computed values, and entity construction
will each require a fresh termination argument.

## Provenance and proof compression

Retaining every derivation is transparent but can grow combinatorially. A later
IR can hash-cons proof nodes or expose minimal proofs without changing truth.

## Temporal knowledge

Validity intervals should consume an explicit evaluation date. Wall-clock time
must remain outside the trusted runtime.

## Solver integration

Arithmetic comparisons are currently direct and ground. Symbolic constraints
should enter through a narrow backend that returns proof-producing results and
has deterministic configuration.
