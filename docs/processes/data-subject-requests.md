# Data-Subject Requests

Profile is the person's single point of contact for requests about their data. It records each request and the part each member plays in it, coordinates the members through a port the host supplies from this repository's [adapters](../adapters.md), and keeps legal holds. Each member answers for what it holds. Jurisdiction-specific deadlines and exemptions are supplied by the host's policy for the tenant's jurisdiction; the defaults below follow UK data protection.

## Trigger and actors

- **The person**, signed in within the last 15 minutes, opens an access or a restriction request from their profile. Erasure from the person is [account closure](account-closure.md), which the profile page links to; correction of their own details is the profile page itself.
- **A platform operator**, acting on a request verified outside the platform, opens a request of any type through Profile's server functions, with a reason code. There is no endpoint for it.
- **A platform operator** places and releases legal holds, through Profile's server functions, with a reason code.

## Request types and parts

Each request names the members' parts it needs. A part is `pending`, `done`, `exempt` (refused, with a reason code), or `held` (under legal hold).

| Request | Profile | Identity | Authentication | Authorisation | Domain capabilities |
|---|---|---|---|---|---|
| Access | Record, disclosure settings, departures, requests and holds | Identity, external identifiers, every membership (`exportIdentityData`) | Sign-in identifiers, factor types and times (never secrets), sessions (never tokens) (`exportAuthenticationData`) | Role assignments and the grants held (`exportAuthorisationData`) | Through a host-supplied export port, per capability (planned) |
| Correction | The person corrects their own record | Rename each group named in the request whose name identifies the requester | Sign-in identifier change, through Authentication's own flow | — | Their own records, through their contracts |
| Erasure | Delete the record and key (anonymisation) | Close the identity ([account closure](account-closure.md)) | Delete the account (`deleteAuthenticationAccount`) | Remove assignments and grants (`eraseAuthorisationPrincipal`) | Delete or unlink as their purpose allows |
| Restriction or objection | Every audience set to `nobody` | Optionally, pause the identity (the person's own action) | — | — | Stop the processing objected to |

## Steps

1. **Profile** records the request with a correlation identifier, its parts and a due date (default one calendar month from opening), and writes `profile.request-opened`.
2. **Access.** **Profile** calls the host's coordination port (`profileRequestCoordinatorFromMembers`), which calls each member's export function and returns each part's bundle, or a failure for that part. No member sends personal data to another except to Profile for the bundle. **Profile** encrypts the assembled archive with the person's own key and keeps it for 7 days, downloadable by the person after a sign-in within 15 minutes, then deletes it. Parts that failed stay `pending` and are retried by Profile's maintenance.
3. **Correction.** **Identity**'s part is a rename by the group's owners (`identity.groups:rename`, `medium` risk). Profile's request names each group by its identifier only, since Identity never holds the requester's name and Profile never holds a group's. **Profile** marks Identity's part `done` on `group.renamed` for every named group.
4. **Erasure.** The operator closes the identity through Identity's closure, or the person does. On `identity.closed`, the host's [event handler](../adapters.md#events) gives the event to Profile, then deletes the Authentication account and erases the Authorisation principal, except for parts under legal hold. **Profile** erases its record unless Profile's part is held, and marks each part `done` as the handler reports it (`recordProfileRequestPart`).
5. **Restriction.** **Profile** sets every audience to `nobody` and marks its part `done`. When the request names Identity's part, it is `done` on `identity.paused`.
6. **Profile** records the request `completed` once no part is `pending`, writing `profile.request-completed`; an exempt part carries its reason code.

## Legal holds

A legal hold is recorded by Profile: the identity, the parts it covers (any of `profile`, `authentication`, `authorisation`), a reason code and an end date, at most 7 years ahead; a longer hold is a new hold. It blocks only the erasure of the parts it covers, never access, correction or restriction, and never Identity's closure: the identity still closes, and the person is hidden from everyone.

- While a hold covers **Profile**, Profile keeps the closed person's encrypted record, readable by nobody through any function, and erases it when the hold ends.
- While a hold covers **Authentication** or **Authorisation**, the event handler does not erase that member's part on `identity.closed`. Authentication still refuses sign-in, since the identity is closed, so the sign-in identifier cannot be used to sign up afresh until the hold ends.
- A hold ends on its end date (Profile's maintenance) or when an operator releases it, writing `profile.legal-hold-ended` with its parts. The host's [Profile event handler](../adapters.md#events) then carries out the erasures the hold deferred, if the identity is closed by then.
- An erasure request whose part is held is `held`, not `exempt`; it completes when the hold ends.

## Rules

- Requests never reveal other people's personal data. Exports of group activity show other members as Profile's disclosure rules would show them to the requester.
- Erasure is anonymisation by unlinking (ADR-0005 §2.8): domain records keep the opaque identifier.
- **Group names.** Identity holds no personal data, but a group's name can identify a person. If the owners have not renamed it within half the request's deadline, Profile raises the request to operators (`profile.request-escalated`, reason `group-rename-overdue`), and a platform operator renames it, with a reason code.
- **Authentication is never a source of profile data.** Its part covers sign-in identifiers, factors and sessions only; it holds no name, picture or other attribute describing the person to export, correct or erase.
- Only Profile stores the archive, and only encrypted with the person's key: erasure of the person destroys it with everything else.

## Failure handling

- A member that fails an export leaves its part `pending`; Profile's maintenance retries it and never assembles a partial archive as complete. The person sees which parts are still to come.
- Erasure is driven by `identity.closed` and `profile.legal-hold-ended` from the outboxes; a handler that fails rejects the event, so the relay delivers it again. Every erasure function is idempotent.
- A request still open 7 days before its due date, or a group rename overdue at half the deadline, is raised to operators with `profile.request-escalated`.

## Events

| Event | Publisher | Data |
|---|---|---|
| `profile.request-opened` | Profile | Request, identity, type, origin, parts, due date |
| `profile.request-completed` | Profile | Request, identity, each part's outcome and reason code |
| `profile.request-escalated` | Profile | Request, identity, reason code |
| `profile.legal-hold-placed`, `profile.legal-hold-ended` | Profile | Hold, identity, parts, reason code, end date |
| `identity.closed`, `identity.paused`, `group.renamed` | Identity | As in Identity's contract |
| `authentication.account-deleted` | Authentication | Principal |
| `authorisation.principal-erased` | Authorisation | Principal |

All carry identifiers, codes and times only.

## Acceptance tests

- An export contains each member's part and no other person's personal data, and is downloadable for 7 days only, after a recent sign-in.
- Erasure leaves no personal data for the person in any member except under recorded legal hold.
- A hold covering Authentication keeps the account after closure, sign-in stays refused, and the account is deleted when the hold ends.
- A request is answered or raised to operators before its due date.
- A correction or erasure request about a group name ends with the group renamed, by its owners or, failing them, by an operator.
