# Retention

Every member keeps records that outlive their purpose: delivered events, ended sessions, decided changes, expired invitations and codes. Retention schedules say how long each kind is kept once its purpose is over, so that nothing is kept for ever by default. Each member declares, enforces and documents its own schedules in its contract; this document sets the shape they share and the rules that span members.

Retention is not erasure on request ([data-subject requests](data-subject-requests.md)), closure ([account closure](account-closure.md)) or disposal of a deleted group ([group deletion](group-deletion.md)): those remove records whose subject has gone. Retention removes records whose subject remains, once they are no longer needed.

## Trigger and actors

- **Each member's maintenance**, which the host schedules (as for every member today), deletes records past their schedule.
- **The host** sets each schedule's period in the member's policy, within its bounds.
- **A platform operator** places legal holds, which pause retention for what they cover.

## Schedules

Each member declares a schedule for every kind of record it keeps after its purpose is over:

| Field | Meaning |
|---|---|
| Kind | The records it covers, named in the member's contract |
| From | The moment its period starts: delivery, end, decision, expiry |
| Default | The period a host gets without choosing |
| Bounds | The shortest and longest periods a host may set. The shortest is never less than any process here needs; the longest is never more than 7 years |
| Holds | Which legal holds pause it: Profile's on a person, Identity's on a group or tenant, or none |

A host sets the periods in each member's policy at start-up. A value outside the bounds fails the member's composition, as an invalid policy does today.

The schedules each member must declare, at least:

| Member | Kind | From | Default | Bounds |
|---|---|---|---|---|
| Every member | Outbox events | Delivery | 30 days | 7 to 365 days |
| Identity | Invitations and acceptance attempts | Use, refusal, revocation or expiry | 90 days | 14 to 365 days |
| Identity | Join requests | Decision or expiry | 1 year | 30 days to 7 years |
| Identity | Governance changes | Decision, withdrawal or expiry | 2 years | 1 to 7 years |
| Identity | Break-glass reviews | Closure of the review | 7 years | 2 to 7 years |
| Authentication | Sessions | End or expiry | 90 days | 30 to 365 days |
| Authentication | Credential-recovery records | Recovery | 1 year | 30 days to 2 years |
| Authentication | Break-glass enrolment tokens | Use or expiry | 30 days | 1 to 365 days |
| Authorisation | Pending role and grant changes | Decision, withdrawal or expiry | 2 years | 1 to 7 years |
| Profile | Data-subject requests and their parts | Completion | 2 years | 1 to 7 years |
| Profile | Legal holds | End or release | 1 year | 30 days to 7 years |
| Profile | Contact-detail verification codes | Use or expiry | 1 day | 1 to 30 days |

Records whose subject remains and which are needed for as long as it does are not on a schedule, and the member's contract says so: Identity's ended memberships (Profile's former-member relationship and the group's departure data policy rely on them) and tombstones; Authorisation's assignments and grants (they end by expiry, removal or disposal); Profile's departure records (they end with the group or the person).

## Rules

- **Holds pause retention.** A record covered by a legal hold is kept until the hold ends, then deleted at the next run if its period has passed. A member asks for the holds it needs through a port the host supplies ([adapters](../adapters.md#ports), `legalHoldsFromMembers`): Profile for a person, Identity for a group or tenant. If it cannot learn whether a record is held, it keeps the record and tries again at the next run.
- **Never before a process needs it.** An outbox event is deleted only once delivered; a governance change only once decided and its digest no longer awaited; a credential-recovery record not before the longest recovery hold in force has passed.
- **A shorter period is a risk decision.** Setting a period below its default needs the same documented risk treatment as shortening a [safety period](README.md#safety-periods), cited in the host's configuration.
- **Deletion leaves nothing.** A deleted record is removed from the member's store, not marked; derived copies and backups age out under the Data Store Security Standard's rules for the tenant's data region.
- **Each run is announced, not each record.** Maintenance writes one `<member>.retention-applied` event for a run that deleted anything, with counts by kind, and never the identifiers it deleted.

## Failure handling

Maintenance that fails part-way leaves what it had not reached for the next run: every deletion is by schedule, so a later run deletes the same records and no more. A member whose maintenance has not run within twice its interval says so in its health check.

## Events

| Event | Publisher | Data |
|---|---|---|
| `identity.retention-applied`, `authentication.retention-applied`, `authorisation.retention-applied`, `profile.retention-applied` | Each member | Counts by kind; the run's time |

## Acceptance tests

- A host policy with a period outside its bounds fails the member's composition.
- A record past its period is gone after the next maintenance run, and one within it is not.
- A record covered by a legal hold survives its period, and goes at the first run after the hold ends.
- An undelivered outbox event survives its period.
- `<member>.retention-applied` carries counts, never identifiers.
