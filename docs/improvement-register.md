# Suite Improvement Register

**Status:** Living register. Each item is either decided and recorded, planned for a named phase, or awaiting a decision.  
**Origin:** the 24 suite improvements proposed during the IAM design discussion (2026-10-09), with the decisions taken in that discussion.

Status values: **Recorded** (decided and specified in the document named), **Planned** (agreed in principle, specified when its phase starts), **Decision needed** (open; listed in [Open decisions](#open-decisions)).

## Highest value: cheap now, expensive later

| # | Improvement | Owner | Status | Where recorded or planned |
|---|---|---|---|---|
| 1 | Shared integration package, plus a **conformance test suite exported by each member** (for example, proving any directory adapter fails closed, honours its consistency level and revokes in time) | iam-integration; each member | Planned | This repository's roadmap phases 2–4. Conformance suites to be added to each member's phase 1 or 2 |
| 2 | Durable events through a transactional outbox | All members | Recorded | [Architecture](architecture.md) §4; Data Store Security Standard §5 |
| 3 | Suspending, pausing an account or closing an identity ends its sessions | Identity → Authentication | Recorded | ADR-0005 §2.9; [Pausing and suspension](processes/pausing-and-suspension.md); Authentication change in the [roadmap](roadmap.md) |
| 4 | Data-subject rights (access, export, correction, erasure) across every member | Profile coordinates; all members | Recorded | [Data-subject requests](processes/data-subject-requests.md); [Account closure](processes/account-closure.md) |
| 5 | SCIM 2.0-compatible data model: `externalId` on identities and groups, an `active` flag derived from state, SCIM user and group shapes | Identity (structure), Profile (attributes) | Planned | Identity phase 1 contract |
| 6 | Safe names: Unicode NFC, reject invisible and control characters, detect confusable look-alikes | Identity (group names), Profile (person names) | Planned | Identity and Profile phase 1 |

## Security

| # | Improvement | Owner | Status | Where recorded or planned |
|---|---|---|---|---|
| 7 | Time-limited role assignments (`expiresAt`) and just-in-time elevation for critical roles | Authorisation | Planned | Authorisation phase 2 schema |
| 8 | Separation of duties: nobody grants themselves a role or access at any risk level (outside their own personal group); two-person rule for `high` and `critical` | Authorisation, Identity | Recorded | ADR-0005 §2.4; [Approvals](processes/approvals.md) |
| 9 | Access reviews: who holds what, since when, for owners to re-confirm or remove | Authorisation, Identity | Planned | Authorisation phase 3 (administration) |
| 10 | Break-glass emergency access | Host procedure, Authentication, Identity | Recorded | ADR-0007: passkey-only, no standing privileges, suspension and orphaned-group recovery only, alert and mandatory review on every use |
| 11 | Row-level security on tenant- and group-isolated tables, with `SET LOCAL` and a non-owner runtime role | Identity, Authorisation | Recorded | ADR-0006 §5; Data Store Security Standard §3.5 |
| 12 | Coarse errors in Identity: "not found" and "forbidden" never reveal whether a group, member or account exists | Identity | Planned | Identity phase 1 contract (error codes), matching Authorisation; invitations already specified in [Joining and leaving](processes/joining-and-leaving.md) |
| 13 | Correlation identifiers on every request, port call and event | All members | Recorded | [Architecture](architecture.md) §5 |
| 14 | Shared hardened CI: reusable workflows and the dependency-review allow-list in the organisation's `.github` repository | Organisation | Planned | Separate task once Identity's CI exists, so three layer repositories can adopt it together |

## Universality and interoperability

| # | Improvement | Owner | Status | Where recorded or planned |
|---|---|---|---|---|
| 15 | AuthZEN-shaped decision endpoint (subject, action, resource, context) | Authorisation | Planned | Optional later phase, on demand |
| 16 | Framework-free decision engine entry point | Authorisation | Planned | Authorisation phase 2 packaging |
| 17 | Standard OIDC claim names (`name`, `given_name`, `family_name`, `preferred_username`, `locale`, `zoneinfo`) so federated sign-in can fill them | Profile (moved from Identity: personal data lives in Profile) | Planned | Profile phase 1 contract |
| 18 | Mapping identity-provider group claims to memberships, only by explicit host configuration | Identity, iam-integration | Planned | After Identity phase 1; never automatic |
| 19 | Roles and policy as versioned JSON for review and promotion between environments | Authorisation | Planned | Authorisation phase 3 |

## Functionality

| # | Improvement | Owner | Status | Where recorded or planned |
|---|---|---|---|---|
| 20 | Invitations: single use, 14-day expiry, non-enumerating responses, consent of the invitee; tokens stored only as hashes; rate limits | Identity | Recorded | [Joining and leaving](processes/joining-and-leaving.md): bearer tokens stored only as hashes, the address never reaching Identity, rate limits; Identity phase 1 contract |
| 21 | Guest memberships: a `guest` membership kind with restricted default roles, preferred over enabling `externalGrants` | Identity, Authorisation | Recorded | [State models](states.md) §2a: restricted guest role, 90-day renewable end date |
| 22 | Membership start and end dates: scheduled joiners and leavers; contractors end automatically | Identity | Recorded | [State models](states.md) §2 rules 5 and 6: an effective window evaluated on every read; Identity phase 1 contract |
| 23 | Service identities owned by a group, with machine credentials in Authentication | Identity, Authentication | Recorded in part | [Provisioning](processes/provisioning.md) records service identities without personal groups; group ownership and machine credentials are planned for Identity and Authentication |
| 24 | Support "act as" access | Suite | Recorded: **forbidden** | ADR-0005 §2.2; support uses a time-limited grant to the supporter's own identity. Forbidden on recommendation, accepted when ADR-0005 was merged; allowing it later (with consent, step-up, a time limit, read-only by default, visible to both people and audited under both identities) needs a new ADR |

## Decisions from the discussion that extend the original list

| Decision | Recorded in |
|---|---|
| Suite membership: `authentication`, `identity`, `profile`, `authorisation`, `iam-integration`; `iam-integration` distinct from the `integrations` hub | ADR-0005 §1 |
| All personal data describing a person lives in Profile; sign-in identifiers stay in Authentication | ADR-0005 §1; ADR-0006 §6 |
| Self-sovereignty in the personal group | ADR-0005 §2.1 |
| Founding owner; last-owner protection | ADR-0005 §2.3; [Group lifecycle](processes/group-lifecycle.md) |
| Two-person rule tiered by risk; groups may raise, never lower; single-owner fallback to parent, tenant or published delay | ADR-0005 §2.4; [Approvals](processes/approvals.md) |
| `paused` (by the person) distinct from `suspended` (by others); roles kept but inactive; account-wide pause cannot be prevented | ADR-0005 §2.5–2.6; [State models](states.md) |
| Departure data policy per group; the leaver's right to anonymisation | ADR-0005 §2.7; [Joining and leaving](processes/joining-and-leaving.md) |
| Anonymisation by unlinking opaque identifiers | ADR-0005 §2.8 |
| Polyglot stores behind ports; visible-scopes query for stores that cannot run policy | ADR-0006 |
| Data region per tenant applied to every copy | ADR-0006 §7; Data Store Security Standard §6.4 |
| Account closure with a grace period | [Account closure](processes/account-closure.md) |
| Documentation placement: detail in capability and integration repositories, ADRs in platform-architecture | ADR-0004 |

## Refinements to the original items from the discussion

| Item | Refinement | Recorded in |
|---|---|---|
| 3 | Leaving a group is not closing an account: leaving ends that membership's access and leaves sessions untouched; only identity-level suspension, account pause and closure revoke sessions | [Joining and leaving](processes/joining-and-leaving.md); [Pausing and suspension](processes/pausing-and-suspension.md) |
| 3, 4 | The group owns information left behind; its departure data policy decides attribution, visibility in history and the handling of deletion requests within the law; the leaver always has a right to anonymisation | ADR-0005 §2.7; [Joining and leaving](processes/joining-and-leaving.md) |
| 4 | Data-subject rights are a request workflow (request, each member reports, group policies and legal holds applied, outcome recorded), not blanket deletion; free text written by the person is handled by each domain capability | [Data-subject requests](processes/data-subject-requests.md); [Joining and leaving](processes/joining-and-leaving.md) |
| 8 | A person is sovereign over themselves and everything their personal group owns, including sharing it; everything else is by grant. No self-grant at any risk level; `low` and `medium` changes by one other authorised person; `high` and `critical` by the two-person rule; groups may raise, never lower | ADR-0005 §2.1, §2.4; [Approvals](processes/approvals.md) |
| 8 | The first permission: a new group's creator is its founding owner; a new tenant is provisioned by the platform operator under a written procedure | ADR-0005 §2.3; [Planned processes](processes/README.md#planned-processes) |
| 8 | The grant workflow records requester, beneficiary, risk, justification, approvals, expiry and escalation | [Approvals](processes/approvals.md) |
| 11 | Row-level security is required, not optional, and security must extend to other kinds of store (graph, search, analytics) through the visible-scopes query and derived-store rules | ADR-0006; Data Store Security Standard |
| New | `paused` state controlled by the person, account-wide or per group, with finer visibility controls in Profile; a paused member can view, is hidden and receives nothing; roles are kept but inactive; groups may limit pausing within the group but never prevent an account-wide pause | ADR-0005 §2.5–2.6; [State models](states.md); [Pausing and suspension](processes/pausing-and-suspension.md) |
| New | Workflows to specify: account lifecycle, membership, privilege, data-subject rights, retention, groups and tenants; compliance across jurisdictions through per-tenant policy packs and data regions | [Processes](processes/README.md), including planned processes |

## Decided (formerly open)

| # | Question | Options | Decision (2026-10-09) |
|---|---|---|---|
| D1 | Break-glass emergency access (item 10). The approvals process says emergency changes have no bypass. | (a) No break-glass: incidents use suspension with a second operator; (b) Break-glass accounts with passkeys only, no standing privileges, every use a loud event and a mandatory review | (b), recorded in ADR-0007: the platform may run with a single operator, who cannot satisfy the second-operator approval in an incident |
| D2 | Guest memberships (item 21) | (a) A `guest` membership kind in Identity with restricted default roles; (b) External grants in Authorisation only | (a), recorded in [State models](states.md) §2a |
| D3 | Defaults proposed in the processes | 30-day closure grace; 72-hour and 7-day approval delays; 14-day orphan recovery; 14-day invitation expiry; 7-day export availability | Accepted, changeable within bounds; recorded in [Processes](processes/README.md) |
