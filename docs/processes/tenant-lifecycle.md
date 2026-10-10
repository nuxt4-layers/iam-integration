# Tenant Lifecycle

A tenant is an isolation boundary with a jurisdiction and a data region (Identity's contract §4), held by Identity. This process is the platform's written procedure for opening and shutting one. Identities are global, so shutting a tenant closes nobody's account: the people whose home tenant it was are re-homed, and their memberships in the tenant end.

| State | Meaning |
|---|---|
| `active` | Normal operation |
| `closing` | The notice period: no new groups or memberships; the root groups' owners may export the tenant's governance records; people whose home tenant it is are told they will be re-homed |
| `closed` | Every group in it deleted; only Identity's tombstone of the tenant remains, with its jurisdiction and data region, so that records naming it still resolve |

## Provisioning

**Actor:** a platform operator, with `identity.tenants:manage` in the platform group (`critical`, with [approval](approvals.md)).

1. **Identity** creates the tenant (`active`) with its jurisdiction and data region, the codes the host registers in its policy, and writes `tenant.created`. The data region is set once.
2. **Identity** creates the tenant's root group with the first owner the operator names, who must already be an `active` identity, as a root group created in the platform group's name ([group lifecycle](group-lifecycle.md#create)).
3. **Authorisation** gives the first owner `owner` in the root group on `group.created`, as for any group.

## Shutdown

### Trigger and actors

- **The owners of the tenant's root group** request it, with `identity.tenants:close` on the root group (`critical`), after reauthentication with a phishing-resistant authenticator; or **a platform operator** starts it, with the same permission in the platform group.
- Either way it is a `critical` governance change of the platform group (`tenant.close`; a cancellation is `tenant.cancel-closing`): it is approved by the platform's operators (one other than the requester, or two where the platform group requires two), never by the tenant's own owners, and waits out the published `critical` delay.
- **A platform operator** may cancel it during the notice period, with the same approval.

### Preconditions

- The tenant is `active`.
- It is not the tenant of the host's platform group, nor the host's default home tenant (`defaultHomeTenantId`): the host names another default first.

### Steps

1. **Identity** sets the tenant `closing`, with a notice period (by default 30 days, within 30 to 180; set only by the platform: see [safety periods](README.md#safety-periods)), and writes `tenant.closing` with its end. From now no group or membership is created in it, and no invitation into it is accepted.
2. **Identity** writes `identity.rehoming-scheduled` for every identity whose home tenant it is, with the date, so that the host's notification capability tells each person, without Identity holding an address. A person who wants a copy of what their personal group holds makes a data-subject access request ([data-subject requests](data-subject-requests.md)) during the notice period.
3. **The owners of the tenant's root group** may download the tenant's governance export ([below](#governance-export)) during the notice period.
4. At the end of the notice period, **Identity** re-homes each of those identities to the host's default home tenant and writes `identity.rehomed` for each. If both tenants have the same data region, the personal group moves with the person and keeps its identifier. Otherwise Identity gives the person a new, empty personal group in the new home tenant, and deletes the old one ([group deletion](group-deletion.md)).
5. **Profile**, on `identity.rehomed` through the host's [event handler](../adapters.md#events), places the person's record in the new home tenant's data region if it differs.
6. **Identity** closes every service identity owned by a group in the tenant (`identity.closed`, through [account closure](account-closure.md) without a grace period, since no person is behind it), then archives and deletes every group in the tenant, from the leaves up, without further approval. Each group's members leave it (each `membership.ended`, under the group's departure data policy), and each group follows [group deletion](group-deletion.md) from its first step.
7. **Identity** sets the tenant `closed` and writes `tenant.closed`, with `disposal: 'due'`, or `'deferred'` when a hold covers the tenant.
8. **Authorisation**, through the host's [event handler](../adapters.md#group-and-tenant-disposal) on `tenant.closed` with disposal due, or on `tenant.disposal-due` (`disposeAuthorisationTenant`), removes the tenant's custom roles and any pending change left for it, and writes `authorisation.tenant-disposed`. Identity records the confirmation as for a group.

Authentication takes no part: sign-in identifiers and credentials belong to the person, not to a tenant. Profile holds nothing scoped to a tenant beyond its groups.

### Cancellation

Until the notice period ends, an approved cancellation sets the tenant `active` again and writes `tenant.closing-cancelled`. Nothing has been re-homed, archived or deleted by then, so nothing needs restoring, and Identity withdraws the scheduled re-homing (`identity.rehoming-cancelled` for each identity told).

## Governance export

During the notice period, an owner of the tenant's root group may download the tenant's governance records, after reauthentication at `aal2` (`identity.tenants:export` on the root group, `high`). It holds no personal data: identifiers, kinds, states and dates only.

| Member | Part |
|---|---|
| Identity | The tenant, its groups (names, parents, settings, states), memberships (identity identifiers, kinds, dates, states), and decided governance changes (`exportIdentityTenantData`) |
| Authorisation | Custom roles as versioned documents, role assignments, grants, default roles and review intervals in the tenant's groups (`exportAuthorisationTenantData`) |

The host's endpoint assembles it through the [adapter](../adapters.md#tenant-export) and returns it to the owner who asked. Identity decides who may have it; Authorisation's part is asked for only once Identity has agreed. Nothing stores the export; each download is assembled afresh and is audited with `tenant.exported`.

## Failure handling

- Each step is driven by Identity's maintenance and outbox and retried until it succeeds; the tenant stays `closing` until every group in it is deleted.
- Re-homing an identity, moving or replacing its personal group, and writing `identity.rehomed` happen in one transaction.
- Disposal confirmations, holds and escalation are as in [group deletion](group-deletion.md#failure-handling), with `tenant.disposal-overdue` for a tenant's own part.

## Events

| Event | Publisher | Data |
|---|---|---|
| `tenant.created` | Identity | Tenant, jurisdiction, data region |
| `tenant.closing` | Identity | Tenant, end of the notice period |
| `tenant.closing-cancelled` | Identity | Tenant |
| `tenant.closed` | Identity | Tenant, `disposal` (`due` or `deferred`) |
| `tenant.disposal-due`, `tenant.disposal-overdue` | Identity | Tenant; for overdue, the members still to confirm |
| `tenant.exported` | Identity | Tenant, the requester |
| `identity.rehoming-scheduled`, `identity.rehoming-cancelled` | Identity | Identity, tenant, date |
| `identity.rehomed` | Identity | Identity, old and new home tenant, old and new personal group |
| `authorisation.tenant-disposed` | Authorisation | Tenant |

## Acceptance tests

- A tenant's own owners cannot approve its shutdown; a platform operator other than the requester can.
- Shutting the platform group's tenant, or the default home tenant, is refused.
- During the notice period, creating a group or membership in the tenant, or accepting an invitation into it, is refused, and the root group's owner can download a governance export that names no person.
- Cancellation before the end of the notice period leaves every group, membership and home tenant as it was.
- At the end of the notice period, a person whose home tenant it was keeps their identity, sign-in and memberships in other tenants, and has a personal group in the default home tenant: the same one if the data regions match, a new empty one if not.
- After closure, no group in the tenant confers anything, Authorisation holds no custom role for it, and Identity holds only tombstones.
- A hold on the tenant defers the disposal of every group in it and of the tenant's own part until the hold ends.
