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
| Authorisation | Contract 3: `paused` membership status conferring view-only access | [State models](states.md) §2 |
| Authorisation | Visible-scopes query | ADR-0006 |
| Authorisation | Pending-change store and approval flow for role and grant changes | [Approvals](processes/approvals.md) |
| Authentication | Provisioning port to Identity; principal identifier is the identity identifier | [Provisioning](processes/provisioning.md) |
| Authentication | Refuse sign-in and session refresh for `suspended` and `closed` identities; revoke sessions on events | [Architecture](architecture.md) §4 |
| Identity | Everything in the state models and processes; it does not exist yet | — |
| Identity (phase 1) | SCIM-compatible `externalId`; safe names; coarse errors; correlation identifiers; membership start and end dates; hashed, rate-limited invitations; conformance suite for its directory port | [Improvement register](improvement-register.md) items 5, 6, 12, 13, 20, 22, 1 |
| Authorisation (phase 2) | Time-limited and just-in-time assignments; framework-free engine entry point; directory conformance suite | [Improvement register](improvement-register.md) items 7, 16, 1 |
| Profile (phase 1) | OIDC standard claim names; safe names; fine-grained pause visibility controls | [Improvement register](improvement-register.md) items 17, 6; [Pausing and suspension](processes/pausing-and-suspension.md) |
| Profile | Record, disclosure, departure data policy application, data-subject coordination | — |

## Open questions for the Identity design round

Open decisions D1 to D3 in the [improvement register](improvement-register.md) are settled in the same round.

1. Whether Identity issues the identifier before Authentication creates the credential (as specified) or Authentication's existing user identifier is adopted as the identity identifier for existing deployments.
2. Which permissions count as "viewing" for paused memberships: a flag on catalogue entries, or a naming convention (`*.read`).
3. Whether group pause restrictions (notice, approval) are needed in the first release.
4. The exact grace-period and delay defaults (30 days closure, 72 hours and 7 days approval delays, 14 days orphan recovery).
