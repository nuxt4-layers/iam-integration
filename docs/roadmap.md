# Roadmap

| Phase | Scope | Status |
|---|---|---|
| 1. Specification | Suite architecture, state models and cross-capability process specifications | In review |
| 2. Contracts | The members' shapes the adapters need, structurally (`server/adapters/members.ts`); each member's own contract stays the source | In review |
| 3. Reference adapters | Adapters between Identity, Authentication and Authorisation, Identity's event handling and credential recovery ([adapters](adapters.md)); Identity's events forwarded to Profile | In review |
| 4. Composition tests | End-to-end tests of each process's acceptance tests in `platform-test-harness` | Planned |

## Changes required in members

| Member | Change | Source |
|---|---|---|
| Authorisation | Contract 3: `paused` membership status and principal status; `effect` attribute on catalogue permissions; paused standing gives `view` at `low` or `medium` risk only, on every route. In review in nuxt4-layers/authorisation#6, with Identity's effects in nuxt4-layers/identity#16; the directory adapter passes `paused` through ([adapters](adapters.md)) | [State models](states.md) §2 |
| Authorisation | Visible-scopes query | ADR-0006 |
| Authorisation | Adapters for Identity's access-decision and approval-policy ports; Identity's permissions in the catalogue; default and guest roles applied on `membership.added` by kind. Storage, decisions and qualification In review in [nuxt4-layers/authorisation#5](https://github.com/nuxt4-layers/authorisation/pull/5); the adapters and role mapping are in this repository ([adapters](adapters.md)) | [Architecture](architecture.md) §3 |
| Authorisation | Pending-change store and approval flow for role and grant changes | [Approvals](processes/approvals.md) |
| Authentication | Provisioning port to Identity: `reserve` from the engine's user-creation hook (the engine's user identifier is the identity identifier), `confirm` after verification, discard the account on `identity.provisioning-expired`. In review in [nuxt4-layers/authentication#19](https://github.com/nuxt4-layers/authentication/pull/19) | [Provisioning](processes/provisioning.md) |
| Authentication | Enforce passkey-only sign-in for break-glass identities. In review in [nuxt4-layers/authentication#19](https://github.com/nuxt4-layers/authentication/pull/19) | ADR-0007 |
| Authentication | Write `authentication.credentials-recovered` (identity, time, recovery method as a code) after any credential recovery, for Identity's recovery hold. In review in [nuxt4-layers/authentication#19](https://github.com/nuxt4-layers/authentication/pull/19) | [Recovery](processes/recovery.md); [Architecture](architecture.md) §4 |
| Authentication | Never a source of profile data: store no provider-supplied name or picture, and blank those stored before. Done in [nuxt4-layers/authentication#18](https://github.com/nuxt4-layers/authentication/pull/18) | [Architecture](architecture.md) §1 |
| Authentication | Refuse sign-in and session refresh for `suspended` and `closed` identities; revoke sessions on events. In review in [nuxt4-layers/authentication#19](https://github.com/nuxt4-layers/authentication/pull/19) | [Architecture](architecture.md) §4 |
| Identity | Everything in the state models and processes. Phases 1 to 5 (contract, storage, governance and approvals, invitations, lifecycle and recovery, administration API, default pages) are merged in [`nuxt4-layers/identity`](https://github.com/nuxt4-layers/identity); its roadmap records Profile's dependencies on Identity | — |
| Identity | Configurable [safety periods](processes/README.md#safety-periods): platform, tenant and group levels, as governance changes | [Processes](processes/README.md) |
| Identity (phase 1) | SCIM-compatible `externalId`; safe names; coarse errors; correlation identifiers; membership start and end dates; hashed, rate-limited invitations; conformance suite for its directory port | [Improvement register](improvement-register.md) items 5, 6, 12, 13, 20, 22, 1 |
| Authorisation (phase 2) | Time-limited and just-in-time assignments; framework-free engine entry point; directory conformance suite | [Improvement register](improvement-register.md) items 7, 16, 1 |
| Profile (phase 1) | OIDC standard claim names; safe names; fine-grained pause visibility controls | [Improvement register](improvement-register.md) items 17, 6; [Pausing and suspension](processes/pausing-and-suspension.md) |
| Profile | Record, disclosure, departure data policy application, data-subject coordination. Record, disclosure, departures, encryption, the `/api/profile/*` endpoints, the default pages and `ProfilePersonName` (which a host's `IdentityPersonName` wraps, so that neither member imports the other) are merged in [`nuxt4-layers/profile`](https://github.com/nuxt4-layers/profile); data-subject coordination is its phase 4 | [Architecture](architecture.md) §1 |

## Questions for the Identity design round

Open decisions D1 to D3 in the [improvement register](improvement-register.md) are decided too.

All decided on 2026-10-09:

| # | Question | Decision | Recorded in |
|---|---|---|---|
| 1 | Who issues the identifier | Identity issues a UUIDv7 before Authentication creates any credential. Verified in the design round: Better Auth 1.7.7 accepts it through its user-creation hook, so no private map is needed | [Architecture](architecture.md) §2 |
| 2 | Which permissions count as viewing for paused members | An explicit `effect: 'view' \| 'change'` catalogue attribute, default `change`; paused members get only `view` at `low` or `medium` risk, on every route including the personal group and grants | [State models](states.md) §2 |
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
| 6 | Directory vocabulary | Identity's own (effective status including `paused`, kind, dates); the adapter passes `paused` through and turns the identity's state into the principal's status for Authorisation contract 3 | [Architecture](architecture.md) §3 |
| 7 | The personal group's tenant | A home tenant fixed at provisioning: the inviting tenant, or the host's default | [Provisioning](processes/provisioning.md) |
| 8 | Invitations to an address | Bearer tokens, stored only as hashes; the address never reaches Identity | [Joining and leaving](processes/joining-and-leaving.md) |
| 9 | Membership dates | An effective window evaluated on every read; no new state | [State models](states.md) §2 |
| 10 | Departure data policy fields | History visibility (default administrators), deletion-request handling (default anonymise), retention reasons | [Joining and leaving](processes/joining-and-leaving.md) |
| 11 | What a group may say about itself | A safe name only | — |
| 12 | Identity's decisions and permission names | An access-decision port from Authorisation; permissions in Authorisation's `<resource>:<action>` grammar | [Architecture](architecture.md) §3; [Group lifecycle](processes/group-lifecycle.md); [Provisioning](processes/provisioning.md) |
| 13 | Authentication stores a provider's name and picture | Authentication is never a source of profile data nor of the workflows over it; Profile is the only canonical source | [Architecture](architecture.md) §1; [Data-subject requests](processes/data-subject-requests.md) |
| 14 | Forwarded invitation links | A per-kind group setting to confirm who accepted; default confirm for guests, immediate for members | [Joining and leaving](processes/joining-and-leaving.md) |
| 15 | A group name that identifies a person | Accepted with treatment: a valid correction or erasure request is met by a rename | [Data-subject requests](processes/data-subject-requests.md) |
| 16 | Who approves when a group cannot meet its own requirement | One owner of the parent group, then of the tenant's root group, then a published delay, even where the group requires two approvers | [Approvals](processes/approvals.md) |
| 17 | Who governs platform-wide changes and hears objections in recovery | A platform group the host designates; its owners and qualifying members are the platform's operators | [Approvals](processes/approvals.md); [Recovery](processes/recovery.md) |
| 18 | How Identity learns of a credential recovery | Authentication's `authentication.credentials-recovered` event, relayed by the host | [Recovery](processes/recovery.md); [Architecture](architecture.md) §4 |
| 19 | Who may recover an orphaned group | Decided from Identity's own record of ownership and membership, not from a role | [Recovery](processes/recovery.md) |
| 20 | Creating an invitation | Identity returns the token once to an authorised inviter; the host's endpoint delivers it with the address, which never reaches Identity; nobody accepts their own invitation | [Joining and leaving](processes/joining-and-leaving.md) |
| 21 | Fixed safety periods | Configurable within hard bounds: the platform's operators in either direction, tenants and groups only safer; a less safe value waits out the old one; the closure grace period is the platform's alone | [Processes](processes/README.md#safety-periods) |
