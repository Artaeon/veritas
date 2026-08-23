# V0.1 Test Corpus

The checked-in corpus defines behavior before implementation.

## Ten valid bundles

1. Minimal type with no facts.
2. Integer attribute fact.
3. Decimal attribute fact with exact comparison.
4. String equality.
5. Explicit false predicate.
6. Adult classification deriving true.
7. Minor classification deriving false.
8. Two-condition conjunction with a missing-input case.
9. Recursive rules reaching a fixpoint.
10. Opposing rules producing an explicit conflict.

## Ten invalid bundles

1. Missing bundle header.
2. Duplicate type.
3. Attribute owner is unknown.
4. Duplicate property.
5. Entity type is unknown.
6. Fact entity is unknown.
7. Fact property is unknown.
8. Fact literal has the wrong type.
9. Rule variable type is unknown.
10. Comparison operator is invalid for the property type.

## Twenty queries

The automated suite covers known integer values; true and false predicates;
unknown attributes and predicates; direct and multi-hop derivation; lower-bound,
upper-bound, equality, and inequality comparisons; conjunction success and
missing conjunction input; two different entities; explicit false facts;
duplicate support; recursion with and without a seed; conflict; exact decimal
comparison; stable proof order; and stable bundle identity.

The suite also compiles every invalid file, checks structured diagnostic codes,
runs a golden CLI output assertion, and evaluates the same input 100 times to
require byte-identical serialized results.
