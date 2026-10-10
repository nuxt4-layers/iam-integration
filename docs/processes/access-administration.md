# Access Administration

How people are given access in a group, and how it is taken away and reviewed: role definitions, role assignments, grants (sharing), a group's default roles, time-limited assignments and access reviews. **Authorisation** owns every record here and every pending change about it ([approvals](approvals.md)); **Identity** owns the groups, memberships and owners the rules read, and answers Authorisation's governance port. Profile names the people on the pages, through the host.

## Trigger and actors

- **A group's administrators and owners** assign and remove roles, share the group's resources, set the group's default roles and its review interval, and review who holds what, through Authorisation's `/api/authorisation/*` endpoints or its default pages.
- **A tenant's root-group owners** define, change and delete the tenant's custom roles.
- **A person** shares what their personal group owns, with no approver but with step-up.
- **The platform operator** exports and imports a tenant's custom roles as a versioned document, with server functions only (`exportAuthorisationRoles`, `importAuthorisationRoles`); there is no endpoint.

## Changes and their risk

Every change is requested through Authorisation's pending changes, whatever its risk: a `low` or `medium` change applies at once once authorised; a `high` or `critical` one waits for its approval route ([approvals](approvals.md)). The requester must hold the permission named, in the group named, at the assurance the change's risk requires.

| Change | Permission (on) | Risk of the change |
|---|---|---|
| `role.assign` | `authorisation.role-assignments:manage` (the group) | The highest risk among the role's permissions; `critical` for the `group-and-descendants` scope |
| `role.unassign` | `authorisation.role-assignments:manage` (the group) | `medium` |
| `grant.create` | `authorisation.grants:manage` (the resource's owning group) | The highest risk among the permissions granted, at least `high`; `critical` beyond the tenant |
| `grant.revoke` | `authorisation.grants:manage` (the owning group) | `medium` |
| `role.define`, `role.delete` | `authorisation.roles:manage` (the tenant's root group) | `critical` |
| `group.change-default-roles` | `authorisation.group-access:manage` (the group) | The highest risk among the roles chosen, at least `high` |
| `group.change-review-interval` | `authorisation.group-access:manage` (the group) | `high` |
| `assignment.confirm` | `authorisation.role-assignments:manage` (the group) | `low` |

`authorisation.role-assignments:manage` is `medium`: it is the floor for any assignment, and the change's own risk sets the approval and step-up. Assigning `viewer` or `member` therefore needs no approver; `administrator` needs one; `owner`-level roles and the descendants scope need one at phishing-resistant aal2 within 15 minutes. This keeps every powerful assignment as strict as when the permission itself was `critical`.

**Owners follow Identity.** The `owner` role is assigned and removed only from Identity's events (`group.created`, `group.owners-changed`); `role.assign` and `role.unassign` refuse it. Owners change through Identity's approvals.

**No self-grant.** Outside their own personal group, nobody assigns a role to themselves, confirms their own assignment, or grants themselves access (`self-grant`). In their own personal group a person needs no approver to share what it owns, but steps up to the change's risk.

## Steps

1. **Authorisation** checks the requester's permission through its own decision, at `strong` consistency, and reads the group's facts from Identity through its governance port: the group's approval requirement and reference rule, the safety periods in force, its parent and root groups, whether it is the requester's personal group, the requester's recovery hold, and the identities the requester controls.
2. **Authorisation** refuses a self-grant, a change to `owner`, and a change whose target no longer holds (a role not in the tenant, a membership not in effect), then records the pending change with its digest and writes `authorisation.change-requested`. The route is chosen as Identity chooses it: qualifying approvers in the group; one owner of the parent group; one owner of the tenant's root group (owners come from Identity); otherwise the published delay.
3. An approver decides through Authorisation, at the assurance the risk requires; Authorisation re-checks that they qualify (`authorisationQualifies`) or, for the owner fallbacks, that Identity still records them as an owner.
4. When the requirement is met, **Authorisation** applies the change in the same transaction as the decision and its events (`authorisation.change-decided` and the change's own, such as `authorisation.role-assigned`), through its transactional outbox.
5. A change requested within the requester's recovery hold, or a change of default roles to riskier ones, waits as `delayed` until the hold ends (`authorisation.change-held`).

## Default roles

Each group says which role a new member and a new guest receive (`member` and `viewer` by default; either may be none). The host's [Identity event handler](../adapters.md#events) asks Authorisation for them on `membership.added` (`authorisationDefaultRoles`), instead of the host's own mapping. A guest's default role may never hold a `high` or `critical` permission.

## Time-limited assignments

`role.assign` may carry an end date. An assignment past its end confers nothing at once, before Authorisation's maintenance (`runAuthorisationMaintenance`) removes it and writes `authorisation.role-expired`. Extending one is a new assignment, with its own approval. Just-in-time elevation is planned later (improvement register item 7).

## Access reviews

A group's owners and administrators see every assignment in the group with when it was made, by whom, its end date and when it was last confirmed (`assignment.confirm`), and remove what is no longer needed. A group may set a review interval (none by default); an assignment not confirmed within it is shown as overdue and announced once (`authorisation.review-overdue`), and keeps working until someone removes it. Nobody confirms their own assignment.

## Custom roles as documents

`exportAuthorisationRoles({ tenantId })` returns the tenant's custom roles as a versioned document (format version, roles, and a SHA-256 digest of the canonical JSON). `importAuthorisationRoles({ tenantId, document, correlationId })` applies one after the operator's own review: it refuses a document whose digest does not match, a role that would reuse a built-in identifier, or one that deletes a role still assigned, and writes `authorisation.roles-imported` with the digest. Both are server-only.

## Failure handling

- Identity's governance port failing, or answering for a group it no longer knows, refuses the request (`unavailable` or `forbidden`); nothing is recorded.
- Every rule is checked again when a change applies: the membership is in effect, the role still exists in the tenant, the requester is not the beneficiary, the group's requirement is unchanged since the digest was taken. If one no longer holds, the change is `rejected`.
- Events go through Authorisation's outbox; a relay failure retries and never loses the change.

## Events

| Event | Publisher | Data |
|---|---|---|
| `authorisation.change-requested`, `authorisation.change-decided`, `authorisation.change-held` | Authorisation | Change, group, requester, beneficiary, type, risk, route, state |
| `authorisation.role-assigned`, `authorisation.role-unassigned`, `authorisation.role-expired` | Authorisation | Principal, group, role, scope, end date |
| `authorisation.grant-created`, `authorisation.grant-revoked` | Authorisation | Grant, resource type and identifier, holder |
| `authorisation.role-defined`, `authorisation.role-changed`, `authorisation.role-deleted`, `authorisation.roles-imported` | Authorisation | Tenant, role, digest |
| `authorisation.group-access-changed`, `authorisation.review-overdue` | Authorisation | Group, setting codes, assignment |

All carry identifiers, codes and times only.

## Acceptance tests

- Assigning `member` applies at once; assigning `administrator` waits for an approver; assigning the descendants scope needs an approver at phishing-resistant aal2.
- Assigning a role to oneself, or confirming one's own assignment, is refused outside one's personal group; sharing from one's personal group applies at once after step-up, and is refused without it.
- `owner` is never assigned or removed through Authorisation.
- A time-limited assignment confers nothing after its end, before maintenance runs.
- A new member receives the group's default role; a guest's default role can hold no high-risk permission.
- An assignment not confirmed within the review interval is shown overdue and still works until removed.
- A custom role is defined only by an owner of the tenant's root group, with an approval.
