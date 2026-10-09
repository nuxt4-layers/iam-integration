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
| Authorisation | Adapters for Identity's access-decision and approval-policy ports; Identity's permissions in the catalogue; default and guest roles applied on `membership.added` by kind | [Architecture](architecture.md) §3 |
| Authorisation | Pending-change store and approval flow for role and grant changes | [Approvals](processes/approvals.md) |
| Authentication | Provisioning port to Identity: `reserve` from the engine's user-creation hook (the engine's user identifier is the identity identifier), `confirm` after verification, discard the account on `identity.provisioning-expired` | [Provisioning](processes/provisioning.md) |
| Authentication | Enforce passkey-only sign-in for break-glass identities | ADR-0007 |
| Authentication | Never a source of profile data: store no provider-supplied name or picture, and blank those stored before. In review: [nuxt4-layers/authentication#18](https://github.com/nuxt4-layers/authentication/pull/18) | [Architecture](architecture.md) §1 |
| Authentication | Refuse sign-in and session refresh for `suspended` and `closed` identities; revoke sessions on events | [Architecture](architecture.md) §4 |
| Identity | Everything in the state models and processes. Phase 1 (contract, conformance suite, docs) is in review in [`nuxt4-layers/identity`](https://github.com/nuxt4-layers/identity); its roadmap records Profile's dependencies on Identity | — |
| Identity (phase 1) | SCIM-compatible `externalId`; safe names; coarse errors; correlation identifiers; membership start and end dates; hashed, rate-limited invitations; conformance suite for its directory port | [Improvement register](improvement-register.md) items 5, 6, 12, 13, 20, 22, 1 |
| Authorisation (phase 2) | Time-limited and just-in-time assignments; framework-free engine entry point; directory conformance suite | [Improvement register](improvement-register.md) items 7, 16, 1 |
| Profile (phase 1) | OIDC standard claim names; safe names; fine-grained pause visibility controls | [Improvement register](improvement-register.md) items 17, 6; [Pausing and suspension](processes/pausing-and-suspension.md) |
| Profile | Record, disclosure, departure data policy application, data-subject coordination | — |

## Questions for the Identity design round

Open decisions D1 to D3 in the [improvement register](improvement-register.md) are decided too.

All decided on 2026-10-09:

| # | Question | Decision | Recorded in |
|---|---|---|---|
| 1 | Who issues the identifier | Identity issues a UUIDv7 before Authentication creates any credential. Verified in the design round: Better Auth 1.7.7 accepts it through its user-creation hook, so no private map is needed | [Architecture](architecture.md) §2 |
| 2 | Which permissions count as viewing for paused members | An explicit `effect: 'view' \| 'change'` catalogue attribute, default `change`; paused members get only `view` at `low` or `medium` risk | [State models](states.md) §2 |
| 3 | Group pause restrictions in the first release | No; the setting is reserved with the single value `allowed` | [State models](states.md) §2; [Pausing and suspension](processes/pausing-and-suspension.md) |
| 4 | Tenancy | Inside Identity as its own entity, contract section and module, extractable later; tenants carry jurisdiction and data region | This roadmap; ADR-0003 guardrail |
| D1 | Break-glass access | Passkey-only break-glass accounts, limited to suspension and orphaned-group recovery | ADR-0007; [Approvals](processes/approvals.md) |
| D2 | Guest memberships | A `guest` membership kind with a restricted role and a 90-day renewable end date | [State models](states.md) §2a |
| D3 | Process defaults | Accepted; changeable within bounds, shortening a safety period needs a risk treatment | [Processes](processes/README.md) |

## Decisions from the Identity design round

Decided on 2026-10-09 and recorded in Identity's `docs/design-decisions.md`:

| # | Question | Decision | Recorded here in |
|---|---|---|---|
| 5 | Better Auth creates its user before verification | Two-step provisioning with a `pending` identity state, closed after 24 hours if never confirmed | [State models](states.md) §1; [Provisioning](processes/provisioning.md) |
| 6 | Directory vocabulary | Identity's own (effective status including `paused`, kind, dates); the adapter maps `paused` to `suspended` for Authorisation contract 2 | [Architecture](architecture.md) §3 |
| 7 | The personal group's tenant | A home tenant fixed at provisioning: the inviting tenant, or the host's default | [Provisioning](processes/provisioning.md) |
| 8 | Invitations to an address | Bearer tokens, stored only as hashes; the address never reaches Identity | [Joining and leaving](processes/joining-and-leaving.md) |
| 9 | Membership dates | An effective window evaluated on every read; no new state | [State models](states.md) §2 |
| 10 | Departure data policy fields | History visibility (default administrators), deletion-request handling (default anonymise), retention reasons | [Joining and leaving](processes/joining-and-leaving.md) |
| 11 | What a group may say about itself | A safe name only | — |
| 12 | Identity's decisions and permission names | An access-decision port from Authorisation; permissions in Authorisation's `<resource>:<action>` grammar | [Architecture](architecture.md) §3; [Group lifecycle](processes/group-lifecycle.md); [Provisioning](processes/provisioning.md) |
| 13 | Authentication stores a provider's name and picture | Authentication is never a source of profile data nor of the workflows over it; Profile is the only canonical source | [Architecture](architecture.md) §1; [Data-subject requests](processes/data-subject-requests.md) |
| 14 | Forwarded invitation links | A per-kind group setting to confirm who accepted; default confirm for guests, immediate for members | [Joining and leaving](processes/joining-and-leaving.md) |
| 15 | A group name that identifies a person | Accepted with treatment: a valid correction or erasure request is met by a rename | [Data-subject requests](processes/data-subject-requests.md) |
