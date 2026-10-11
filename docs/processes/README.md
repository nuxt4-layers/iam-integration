# Processes

Processes that span more than one IAM member. A process that touches one member only is specified in that member's repository.

| Process | Trigger | Members |
|---|---|---|
| [Provisioning](provisioning.md) | Sign-up, invitation acceptance, or service identity creation | Authentication, Identity, Profile |
| [Group lifecycle](group-lifecycle.md) | Create, reparent, transfer ownership, archive | Identity, Authorisation |
| [Group deletion](group-deletion.md) | An archived group deleted; legal holds on groups and tenants | Identity, Authorisation, Profile, domain capabilities |
| [Tenant lifecycle](tenant-lifecycle.md) | A tenant provisioned or shut down; re-homing; the governance export | Identity, Authorisation, Profile |
| [Retention](retention.md) | Each member's maintenance | All |
| [Joining and leaving](joining-and-leaving.md) | Invitation, request, removal, leaving | Identity, Authorisation, Profile |
| [Pausing and suspension](pausing-and-suspension.md) | The person pauses; an administrator suspends | Identity, Authentication, Authorisation, Profile |
| [Approvals](approvals.md) | A `high` or `critical` governance, role or grant change | Identity, Authorisation, Authentication |
| [Access administration](access-administration.md) | Roles assigned, resources shared, default roles, access reviews, custom roles | Authorisation, Identity, Profile |
| [Account closure](account-closure.md) | The person closes their account | All |
| [Data-subject requests](data-subject-requests.md) | Access, correction, export, erasure or objection | All, coordinated by Profile |
| [Recovery](recovery.md) | Lost credentials; orphaned group | Authentication, Identity, Authorisation |
| [Service identities](service-identities.md) | A service identity created, named, given credentials and memberships, suspended or closed | Identity, Authentication, Authorisation |
| [Break-glass access](break-glass.md) | An incident with too few operators; provisioning, rotation and testing of break-glass accounts | Identity, Authentication, host |

## Planned processes

Agreed in the design discussion; to be specified before the phase that needs them.

| Process | What was agreed | Members |
|---|---|---|
| Jurisdiction policy packs | Each tenant carries a jurisdiction (selecting a policy pack: UK GDPR, EU GDPR, CCPA and so on, with deadlines, legal bases and retention rules) and a data region (ADR-0006 §7). Packs need sign-off by someone qualified in each jurisdiction's law | Host, Profile, all members |
| Just-in-time elevation and access reviews | Improvement register items 7 and 9 | Authorisation, Identity |

## Conventions

Every process document states:

1. **Trigger and actors.** Who may start it, and with what assurance (aal1, aal2, phishing-resistant, recent authentication).
2. **Preconditions.** States that must hold, checked server-side.
3. **Steps.** One numbered step per member action, naming the port or event used.
4. **Failure handling.** What happens if a step fails or a member is unavailable. Every process either completes or leaves every member in a consistent, documented state; partial completion is retried from the outbox, never rolled forward by hand.
5. **Events.** The events published, from the [architecture](../architecture.md) §4.
6. **Acceptance tests.** Behaviour a host composition test must show.

Common rules:

- Steps that change state in one member and must be seen by another use that member's outbox, not a direct call followed by a hope.
- A process step authorised in one member is not re-authorised by the next unless that member's own contract requires it.
- Defaults are secure and accepted as specified (improvement register D3). A host may change a period or limit within bounds; tightening is free, and shortening a safety period below its default needs a documented risk treatment. The safety periods below may also be changed while the platform runs, under the rules in [Safety periods](#safety-periods). Legal deadlines (for example, one month for a data-subject request under UK GDPR) come from the tenant's jurisdiction pack, not from these defaults.
- Reason codes, never free text, are recorded for actions taken against a person.

## Safety periods

A safety period is a wait that protects people when nobody else can stop a change. Whoever can shorten one can get round it, so the periods are configurable only within hard bounds, and only the platform may set them less safe than the deployment's values.

| Period | Default | Hard bounds | Safer when | Set by |
|---|---|---|---|---|
| Published delay, `high` change ([approvals](approvals.md)) | 72 hours | 24 hours to 14 days | Longer | Platform, tenant, group |
| Published delay, `critical` change ([approvals](approvals.md)) | 7 days | 72 hours to 30 days | Longer | Platform, tenant, group |
| Approval expiry ([approvals](approvals.md)) | 7 days | 1 to 14 days | Shorter | Platform, tenant, group |
| Orphaned-group recovery delay ([recovery](recovery.md)) | 14 days | 7 to 60 days | Longer | Platform, tenant, group |
| Recovery hold after a credential recovery ([recovery](recovery.md)) | 72 hours | 24 hours to 14 days | Longer | Platform, tenant, group |
| Closure grace period ([account closure](account-closure.md)) | 30 days | 7 to 90 days | Longer | Platform only |
| Tenant closing notice ([tenant lifecycle](tenant-lifecycle.md)) | 30 days | 30 to 180 days | Longer | Platform only |

**Levels.**

1. **Hard bounds**, in Identity's code and database. Nobody goes beyond them.
2. **Deployment**: the host's policy sets each period's starting value within the bounds, as before.
3. **Platform**: the owners of the host's platform group (the platform's operators) may change a period in either direction within the hard bounds. Going past the deployment's value in the less safe direction needs a documented risk treatment, cited in the change's justification reference.
4. **Tenant**: the owners of a tenant's root group may make a period safer for every group under that root, never less safe than the platform's value.
5. **Group**: a group's owners may make a period safer for their group, never less safe than the tenant's or the platform's.

A tenant or group may later relax a period it made safer, back as far as the level above, under the rule for less safe values below.

The period that applies to a change is the safest of the platform's, the root group's and the group's own. The closure grace period belongs to the person, not to any group, so only the platform sets it: no group's owners may lengthen how long someone waits to leave. The tenant closing notice is the platform's too: a tenant's own owners cannot lengthen the wait for a shutdown the platform's operators approved.

**Rules.**

- Changing a safety period is a `critical` governance change, with [approval](approvals.md). The recovery hold applies to it like any other `critical` change.
- **A less safe value waits out the old one.** Once approved, a change that makes any period less safe takes effect only after the longer of the current `critical` published delay and the current value of each delay it shortens, counted from the request. A safer value takes effect when approved.
- A change keeps the periods it was given when it was requested; a later change of period never moves it.
- Every change of period is announced with `group.settings-changed`, carrying identifiers and setting names only.
- Identity owns the periods and enforces them: in its database for the delays, expiry and hold it records, and in the layer for the closure grace period and the tenant closing notice.
