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
- Defaults are secure. A host may tighten a period or limit; loosening one needs a documented risk treatment.
- Reason codes, never free text, are recorded for actions taken against a person.
