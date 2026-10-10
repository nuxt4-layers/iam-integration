# Group Deletion

Deleting a group disposes of its information in every member and domain capability, under the group's legal holds. It is distinct from [archiving](group-lifecycle.md#archive), which keeps the group and makes it read-only: only an archived group can be deleted. Identity keeps a **tombstone** of every deleted group, so that its identifier is never reused and audit records that name it still resolve to a group that existed, in a tenant, between two dates.

## Trigger and actors

- **An owner of the group**, with `identity.groups:delete` on it (`critical` risk), after reauthentication with a phishing-resistant authenticator, and with [approval](approvals.md): the group's own requirement, or the single-owner fallback to an owner of the parent or root group, or the published `critical` delay.
- **Identity itself**, without a further approval, when a [tenant closes](tenant-lifecycle.md) (every group in it) or an [account closes](account-closure.md) (the person's personal group).
- **A platform operator** places and releases legal holds on groups and tenants (`identity.legal-holds:manage` in the platform group, `critical`, with approval), with a reason code and an end date at most 7 years ahead.

## Preconditions

- The group is `archived`, and has been for at least the `critical` published delay in force, so that its members have seen it read-only before it goes.
- Every child group is already deleted. Deletion never cascades: a subtree is deleted from its leaves up, each with its own approval.
- The group is a standard group. A personal group is deleted only with its identity or its home tenant.
- The group is not the host's platform group, nor the root group of a tenant that is not closing.

## Legal holds on groups and tenants

Legal holds are kept by the member that owns their subject ([architecture](../architecture.md) §8): Profile holds a person's data ([data-subject requests](data-subject-requests.md#legal-holds)); Identity holds groups and tenants, which are not personal data.

- A hold on a group covers that group's information in every member and domain capability. A hold on a tenant covers every group in it, personal groups included.
- A hold never stops a deletion being approved or applied. It defers **disposal**: the group is deleted and confers nothing, but its information is kept, readable by nobody through any function, until no hold covers it.
- A hold ends on its end date (Identity's maintenance) or when an operator releases it, writing `legal-hold.ended`. For every deleted group no hold now covers, Identity then writes `group.disposal-due`.
- A hold on a group preserves records about the group. It does not keep a person's own data from erasure when that person closes their account: an operator who needs a person's records places a hold on the person in Profile as well.

## Steps

1. **Identity** checks the preconditions again when the approved change applies, withdraws every pending change on the group, ends every remaining membership (each `membership.ended`), revokes its invitations and join requests, and sets the group `deleted`. It writes `group.deleted` with `disposal: 'due'`, or `'deferred'` when a hold covers the group or its tenant. A deleted group appears in no directory answer, so it confers nothing from this moment, whatever the other members have still to do.
2. **Identity** disposes of its own part when disposal is due: the group's name, settings, external identifier, ended memberships, invitations, join requests and decided changes. It keeps the tombstone (identifier, tenant, kind, parent, creation and deletion times) and records its own part as confirmed.
3. **Authorisation**, through the host's [event handler](../adapters.md#group-and-tenant-disposal) on `group.deleted` with disposal due, or on `group.disposal-due` (`disposeAuthorisationGroup`), removes every role assignment in the group, every grant on a resource the group owns or to the group as a subject, the group's default roles and review interval, and its pending changes. It writes `authorisation.group-disposed`.
4. **Profile**, given the same events by the handler (`applyProfileIdentityEvent`), removes the group's departure records, pseudonyms and its references in data-subject requests, and writes `profile.group-disposed`.
5. **Domain capabilities** dispose of the information the group owns, through the same events, and each writes its own `<capability>.group-disposed`.
6. **The host's [event handler](../adapters.md#disposal-confirmations)** relays every `*.group-disposed` event to Identity (`recordIdentityDisposal`), which records the member as confirmed.

Authentication holds nothing scoped to a group, and takes no part.

## Failure handling

- Every step after the first is driven from an outbox and retried until it succeeds. Every disposal function is idempotent: disposing of a group already disposed of, or never known, succeeds and confirms again.
- Identity expects a confirmation from each member the host lists in its policy (`disposalParticipants`). A disposal not confirmed by every one of them within 7 days of falling due is raised to operators with `group.disposal-overdue`, naming the members still to confirm, and again every 7 days until it is.
- A confirmation from a member Identity does not expect, or for a group whose disposal is not due, is recorded for audit and changes nothing.
- A hold placed after disposal is due cannot bring back what was already disposed of. Identity refuses to place a hold on a group whose disposal has been confirmed by every member, and says so to the operator.

## Events

| Event | Publisher | Data |
|---|---|---|
| `group.deleted` | Identity | Group, tenant, kind, `disposal` (`due` or `deferred`) |
| `group.disposal-due` | Identity | Group, tenant |
| `group.disposal-overdue` | Identity | Group, the members still to confirm |
| `legal-hold.placed`, `legal-hold.ended` | Identity | Hold, subject (`group` or `tenant` and its identifier), reason code, end date |
| `authorisation.group-disposed` | Authorisation | Group |
| `profile.group-disposed` | Profile | Group |

## Acceptance tests

- Deleting a group that is not archived, has a child group that is not deleted, or is personal, is refused.
- Once deleted, the group confers nothing: a former owner's and a member's decisions on it are denied before any member has disposed of anything.
- After disposal, no member holds a role assignment, grant, default role, departure record or pseudonym for the group, and Identity holds only its tombstone.
- A group under hold is deleted but not disposed of; when the hold ends, every member disposes of it and Identity records each confirmation.
- A hold on a tenant defers the disposal of every group deleted in it.
- A member that does not confirm within 7 days is named in `group.disposal-overdue`.
- A new group never receives a deleted group's identifier.
