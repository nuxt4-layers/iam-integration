# Changelog

All notable changes to `@nuxt4-layers/iam-integration`. The package follows [semantic versioning](https://semver.org/).

## Unreleased

- `CONTRACT.md`: the suite's one-page host contract (ADR-0012 §6): install, settings, what the host passes, the functions screens call, permissions, screens, the headless surface and the rules a host would otherwise discover by failing.
- `profileRequestCoordinatorFromMembers` takes an optional `exportConfiguration`, the configuration layer's `exportConfigurationAccountData`, and answers Profile's `configuration` part with a person's own account settings (`null` without it). The data-subject request process shows the configuration layer's part of each request type.

## 1.0.0 (2026-10-11)

The first stable release.

- The suite architecture, state models and every cross-member process, each with its trigger, actors, steps, failure handling, events and acceptance tests.
- The reference adapters between Identity, Authentication, Authorisation and Profile, tested end to end in `platform-test-harness`.
- The host's [operations guide](docs/operations.md) and the [OWASP ASVS mapping](docs/asvs.md).
