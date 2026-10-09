# iam-integration

Architecture, cross-capability processes and reference adapters for the `nuxt4-layers` Identity and Access Management (IAM) suite.

The suite's members are independent capabilities that never import one another:

| Member | Owns |
|---|---|
| [`authentication`](https://github.com/nuxt4-layers/authentication) | Credentials, sign-in identifiers, sessions, step-up and reauthentication |
| `identity` (next to be built) | Opaque identities, personal groups, groups, the hierarchy, tenants, memberships and their states |
| [`profile`](https://github.com/nuxt4-layers/profile) | The personal data that describes a person, its disclosure, and data-subject requests |
| [`authorisation`](https://github.com/nuxt4-layers/authorisation) | Roles, assignments, grants and server-side access decisions |
| `iam-integration` (this repository) | The suite architecture, the processes that span members, and reference adapters between their ports |

This repository owns no identity, credential, permission or personal data. It is distinct from the general-purpose `integrations` hub.

## Governing decisions

- [ADR-0002 — Composition-Supplied Persistence and Capability-Owned Schemas](https://github.com/nuxt4-layers/platform-architecture/blob/185c4934b641f375179b6e054afdde37df1f1bab/docs/decisions/ADR-0002-composition-supplied-persistence-and-capability-owned-schemas.md)
- [ADR-0003 — Group Model and Identity Before Logging](https://github.com/nuxt4-layers/platform-architecture/blob/185c4934b641f375179b6e054afdde37df1f1bab/docs/decisions/ADR-0003-group-model-and-identity-first.md)
- [ADR-0004 — Documentation Placement](https://github.com/nuxt4-layers/platform-architecture/blob/185c4934b641f375179b6e054afdde37df1f1bab/docs/decisions/ADR-0004-documentation-placement.md)
- [ADR-0005 — Identity and Access Management Suite](https://github.com/nuxt4-layers/platform-architecture/blob/185c4934b641f375179b6e054afdde37df1f1bab/docs/decisions/ADR-0005-iam-suite.md)
- [ADR-0006 — Polyglot Persistence and Data-Store Security](https://github.com/nuxt4-layers/platform-architecture/blob/1a6d9da53c4957ff16ae7a28269c49a39d23cff2/docs/decisions/ADR-0006-polyglot-persistence-and-data-store-security.md)
- [Data Store Security Standard v0.1](https://github.com/nuxt4-layers/platform-architecture/blob/1a6d9da53c4957ff16ae7a28269c49a39d23cff2/docs/standards/data-store-security-v01.md)

Ecosystem-wide rules are not restated here; they live in [`nuxt4-layers/platform-architecture`](https://github.com/nuxt4-layers/platform-architecture).

## Documentation

- [Suite architecture](docs/architecture.md): members, ports, events and how a host composes them
- [State models](docs/states.md): identity, membership and group states
- [Processes](docs/processes/README.md): provisioning, groups, joining and leaving, pausing and suspension, approvals, account closure, data-subject requests and recovery
- [Roadmap](docs/roadmap.md)

## Status

Documentation only. Reference adapters follow once Identity and Profile publish their contracts.
