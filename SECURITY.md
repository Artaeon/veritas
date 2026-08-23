# Security Policy

## Project status

Veritas is an experimental deterministic reasoning kernel. It is not a
certified decision system and must not be used as the sole basis for medical,
legal, financial, safety-critical, or other high-impact decisions.

The parser and resolver enforce documented resource ceilings, but those limits
are defense in depth rather than a security sandbox. Applications processing
untrusted knowledge bundles should still use process isolation, operating-system
resource limits, and explicit input-size limits.

## Supported versions

Security fixes are applied to the current `main` branch. The frozen `v0.1.0`
tag is retained as a reproducible semantics snapshot; a necessary compatible
security correction would be released as a new patch version rather than moving
the existing tag.

## Reporting a vulnerability

Please report suspected vulnerabilities privately to
`raphael.lugmayr@stoicera.com`. Include:

- the affected version or commit;
- a minimal reproduction;
- the expected security impact;
- any suggested mitigation, if known.

Do not include secrets, personal data, or exploitable details in a public issue.
Please allow time for the report to be reproduced and assessed before public
disclosure. No fixed response or remediation time is promised while the project
is maintained on a best-effort basis.

## In scope

- parser/compiler crashes or limit bypasses caused by hostile knowledge input;
- incorrect proof acceptance or fabricated proof support;
- nondeterminism that changes semantic results for identical inputs;
- dependency or build-pipeline vulnerabilities;
- unintended file, process, environment, or network access.

## Out of scope

- incorrect or incomplete domain knowledge supplied by a bundle author;
- decisions made outside the documented Veritas semantics;
- unsupported production deployments or missing application-level isolation;
- denial of service that already terminates with a documented resource-limit
  error.
