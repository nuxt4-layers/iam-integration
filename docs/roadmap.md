# Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1. Specification | Suite architecture, state models and cross-capability process specifications | In review |
| 2. Contracts | Port and event schemas (zod) shared by reference adapters, once Identity and Profile publish contract 1 | Planned |
| 3. Reference adapters | Adapters connecting members' ports (§3 of the architecture) and a reference outbox relay | Planned |
| 4. Composition tests | End-to-end tests of each process's acceptance tests in `platform-test-harness` | Planned |

## Changes required in members

| Member | Change | Source |
|---|---|---|
| Authorisation | Contract 3: `paused` membership status; `effect` attribute on catalogue permissions; paused members get `view` at `low` or `medium` risk only | [State models](states.md) §2 |
| Authorisation | Visible-scopes query | ADR-0006 |
| Authorisation | Pending-change store and approval flow for role and grant changes | [Approvals](processes/approvals.md) |
| Authentication | Provisioning port to Identity; principal identifier is the identity identifier | [Provisioning](processes/provisioning.md) |
| Authentication | Refuse sign-in and session refresh for `suspended` and `closed` identities; revoke sessions on events | [Architecture](architecture.md) §4 |
| Identity | Everything in the state models and processes; it does not exist yet | — |
| Identity (phase 1) | SCIM-compatible `externalId`; safe names; coarse errors; correlation identifiers; membership start and end dates; hashed, rate-limited invitations; conformance suite for its directory port | [Improvement register](improvement-register.md) items 5, 6, 12, 13, 20, 22, 1 |
| Authorisation (phase 2) | Time-limited and just-in-time assignments; framework-free engine entry point; directory conformance suite | [Improvement register](improvement-register.md) items 7, 16, 1 |
| Profile (phase 1) | OIDC standard claim names; safe names; fine-grained pause visibility controls | [Improvement register](improvement-register.md) items 17, 6; [Pausing and suspension](processes/pausing-and-suspension.md) |
| Profile | Record, disclosure, departure data policy application, data-subject coordination | — |

## Questions for the Identity design round

Open decisions D1 to D3 in the [improvement register](improvement-register.md) are decided too.

All decided on 2026-10-09:

| # | Question | Decision | Recorded in |
|---|---|---|---|
| 1 | Who issues the identifier | Identity issues a UUIDv7 before Authentication creates any credential; Authentication keeps a private engine-to-identity map if its engine cannot accept an external identifier (to verify against Better Auth during design) | [Architecture](architecture.md) §2 |
| 2 | Which permissions count as viewing for paused members | An explicit `effect: 'view' \| 'change'` catalogue attribute, default `change`; paused members get only `view` at `low` or `medium` risk | [State models](states.md) §2 |
| 3 | Group pause restrictions in the first release | No; the setting is reserved with the single value `allowed` | [State models](states.md) §2; [Pausing and suspension](processes/pausing-and-suspension.md) |
| 4 | Tenancy | Inside Identity as its own entity, contract section and module, extractable later; tenants carry jurisdiction and data region | This roadmap; ADR-0003 guardrail |
| D1 | Break-glass access | Passkey-only break-glass accounts, limited to suspension and orphaned-group recovery | ADR-0007; [Approvals](processes/approvals.md) |
| D2 | Guest memberships | A `guest` membership kind with a restricted role and a 90-day renewable end date | [State models](states.md) §2a |
| D3 | Process defaults | Accepted; changeable within bounds, shortening a safety period needs a risk treatment | [Processes](processes/README.md) |
