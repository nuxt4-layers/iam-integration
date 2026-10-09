# Processes

Processes that span more than one IAM member. A process that touches one member only is specified in that member's repository.

| Process | Trigger | Members |
|---|---|---|
| [Provisioning](provisioning.md) | Sign-up, invitation acceptance, or service identity creation | Authentication, Identity, Profile |
| [Group lifecycle](group-lifecycle.md) | Create, reparent, transfer ownership, archive | Identity, Authorisation |
| [Joining and leaving](joining-and-leaving.md) | Invitation, request, removal, leaving | Identity, Authorisation, Profile |
| [Pausing and suspension](pausing-and-suspension.md) | The person pauses; an administrator suspends | Identity, Authentication, Authorisation, Profile |
| [Approvals](approvals.md) | A `high` or `critical` governance, role or grant change | Identity, Authorisation, Authentication |
| [Account closure](account-closure.md) | The person closes their account | All |
| [Data-subject requests](data-subject-requests.md) | Access, correction, export, erasure or objection | All, coordinated by Profile |
| [Recovery](recovery.md) | Lost credentials; orphaned group | Authentication, Identity, Authorisation |

## Planned processes

Agreed in the design discussion; to be specified before the phase that needs them.

| Process | What was agreed | Members |
|---|---|---|
| Tenant lifecycle | A new tenant is provisioned by the platform operator under a written procedure, which also appoints its first owner; tenant shutdown disposes of or exports the tenant's data under its jurisdiction | Identity, all members |
| Group deletion | Disposal of a deleted group's information across every store, under the group's policy and legal holds; distinct from archiving | Identity, domain capabilities |
| Retention | Retention schedules per kind of data in each member; legal holds that pause deletion, recorded with a reason code and an end date | All members |
| Jurisdiction policy packs | Each tenant carries a jurisdiction (selecting a policy pack: UK GDPR, EU GDPR, CCPA and so on, with deadlines, legal bases and retention rules) and a data region (ADR-0006 §7). Packs need sign-off by someone qualified in each jurisdiction's law | Host, Profile, all members |
| Just-in-time elevation and access reviews | Improvement register items 7 and 9 | Authorisation, Identity |
| Break-glass access | ADR-0007: passkey-only accounts, suspension and orphaned-group recovery only; the host procedure for provisioning, storing and testing them | Authentication, Identity, host |

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
- Defaults are secure and accepted as specified (improvement register D3). A host may change a period or limit within bounds; tightening is free, and shortening a safety period below its default needs a documented risk treatment. Legal deadlines (for example, one month for a data-subject request under UK GDPR) come from the tenant's jurisdiction pack, not from these defaults.
- Reason codes, never free text, are recorded for actions taken against a person.
