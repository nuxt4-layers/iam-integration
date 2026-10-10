# Suite Architecture

**Status:** Draft for the Identity and Profile design rounds  
**Governed by:** ADR-0005 (members and invariants), ADR-0006 (stores), ADR-0002 (persistence); see the [README](../README.md) for pinned links.

## 1. Shape

The suite is four capabilities that each answer one question, plus this repository, which describes how they cooperate.

| Member | Question it answers | Holds personal data? |
|---|---|---|
| Authentication | Who is making this request, and how strongly did they prove it? | Sign-in identifiers only |
| Identity | Which identity is this, and what is it a member of, in which state? | No: opaque identifiers only |
| Profile | What does this person want others to know about them, in this context? | Yes: the only general store |
| Authorisation | May this subject perform this permission on this resource, now? | No |

Profile is the only canonical source of personal data that describes a person, and of the workflows over it (collection, correction, disclosure, export, erasure). Authentication holds sign-in identifiers for signing in, recovery and security notices only; it never stores, serves or seeds names, pictures or other profile attributes, even when an identity provider supplies them.

No member imports another. The host application composes them: it supplies each member's ports with adapters that call another member's public server functions, and it relays outbox events between them. The reference adapters for these connections are in this repository ([adapters](adapters.md)).

## 2. Identifiers

- The **identity identifier** issued by Identity is the one identifier for a person or service across the suite. Authentication's principal identifier, Authorisation's subject identifier and Profile's record key are all this value. Identity issues it, in the `pending` state, before Authentication creates any credential, and makes it `active` once Authentication has verified the sign-in identifier ([provisioning](processes/provisioning.md)). Authentication's engine, Better Auth, was verified to accept this identifier as its own user identifier, so Authentication keeps no private map.
- Group, tenant and membership identifiers are issued by Identity.
- All identifiers are opaque (UUIDv7) and carry no meaning. None is derived from personal data.
- Anonymisation removes Profile's record for an identity identifier. Other members keep the identifier, which then refers to nobody that the platform can name.

## 3. Ports between members

Each row is a port declared by the consuming member and supplied by the host.

| Consumer | Port | Supplied from | Purpose |
|---|---|---|---|
| Authentication | Identity provisioning | Identity | Reserve a `pending` identity at sign-up and confirm it once the sign-in identifier is verified (which creates the personal group), and read whether an identity may sign in (`active` or `paused`; `pending` only to verify; passkey only for break-glass accounts) |
| Authorisation | `AuthorisationDirectory` | Identity | Actor context (personal group, memberships with status) and group description (lineage, tenant), with `strong` or `bounded` consistency. Identity's directory speaks its own vocabulary (effective status including `paused`, membership kind and dates); the adapter passes `paused` through and gives the principal's status from the identity's state (Authorisation contract 3) |
| Identity | Access decision | Authorisation | Whether a subject may exercise one of Identity's permissions on a group, for every change Identity does not reserve to the person themselves |
| Authorisation | Governance | Identity | For a group: its approval requirement and safety periods in force, its parent and root groups, whether it is the requester's personal group, the requester's recovery hold and the identities the requester controls; and whether a principal owns a group, and how many do, from Identity's own record ([access administration](processes/access-administration.md)) |
| Identity | Approval policy | Authorisation | A permission's risk level, whether an approver qualifies at decision time, and how many others qualify (to choose the approval route) |
| Profile | Disclosure context | Identity | For one viewer and a batch of subjects: each relationship (self, same group, former member, same tenant, none) and standing, and the group's departure data policy |
| Profile | Access decision | Authorisation | Whether a viewer holds one of Profile's permissions on a group: today `profile.suspended-people:view`, under which a group's administrators see its suspended members by name |
| Profile | Request coordination | Identity, Authentication, Authorisation | Each member's part of a data-subject access request, from its server-only export ([data-subject requests](processes/data-subject-requests.md)) |
| Domain capabilities | Display names | Profile | Names to show for a list of identity identifiers, filtered by Profile's disclosure rules for the viewer |
| Each member | Legal holds | Identity, Profile | Whether a legal hold covers a group or tenant (Identity) or the member's part of a person's data (Profile), before retention or disposal deletes anything (§8) |
| Domain capabilities | Visible scopes | Authorisation | The groups in a tenant whose information the caller may read with a given permission (ADR-0006) |

A port that fails rejects. Every consumer fails closed: an unreachable directory denies access, an unreachable Profile shows no name rather than a stale one.

## 4. Events

Each member publishes the lifecycle changes others must act on through a transactional outbox in its own schema (Data Store Security Standard §5). The host relays them; this repository will provide a reference relay.

| Event | Publisher | Consumers |
|---|---|---|
| `identity.provisioned` | Identity | Profile (create an empty record) |
| `identity.provisioning-expired` | Identity | Authentication (discard the unverified account) |
| `identity.paused`, `identity.resumed` | Identity | Authentication (revoke sessions on pause), Profile (hide), notification capabilities (stop sending) |
| `identity.suspended`, `identity.reinstated` | Identity | Authentication (revoke sessions; refuse sign-in), Profile |
| `identity.closure-requested`, `identity.closure-cancelled`, `identity.closed` | Identity | Authentication, Profile, Authorisation, domain capabilities |
| `membership.added`, `.paused`, `.resumed`, `.suspended`, `.reinstated`, `.dates-changed`, `.ended` | Identity | Authorisation (invalidate caches; apply the default or guest role by kind), Profile (disclosure), domain capabilities |
| `group.created`, `group.renamed`, `group.reparented`, `group.owners-changed`, `group.orphaned`, `group.recovered`, `group.archived` | Identity | Authorisation (invalidate caches; assign and remove `owner`; review `group-and-descendants` assignments on reparenting) |
| `group.deleted`, `group.disposal-due` | Identity | Authorisation and Profile (dispose of the group's part when disposal is due), domain capabilities ([group deletion](processes/group-deletion.md)) |
| `group.disposal-overdue`, `tenant.disposal-overdue` | Identity | Operators' tooling |
| `group.settings-changed` | Identity | Profile (departure data policy), Authorisation; notification capabilities (a change of [safety period](processes/README.md#safety-periods)) |
| `tenant.created`, `tenant.closing`, `tenant.closing-cancelled` | Identity | All members; notification capabilities |
| `tenant.closed`, `tenant.disposal-due` | Identity | Authorisation (dispose of the tenant's custom roles when disposal is due) ([tenant lifecycle](processes/tenant-lifecycle.md)) |
| `tenant.exported` | Identity | Audit |
| `identity.rehoming-scheduled`, `identity.rehoming-cancelled` | Identity | Notification capabilities (tell the person) |
| `identity.rehomed` | Identity | Notification capabilities; audit. Profile keeps every record in the one store the host composes, so re-homing needs nothing from it |
| `legal-hold.placed`, `legal-hold.ended` | Identity | Audit (holds on groups and tenants) |
| `break-glass.used`, `break-glass.review-closed` | Identity | Host alerting to every operator and affected owner; audit |
| `join-request.created`, `join-request.decided` | Identity | Notification capabilities (the group's administrators; the person who asked) |
| `invitation.accepted`, `invitation.refused` | Identity | Notification capabilities (the inviter; administrators when confirmation is needed) |
| `approval.requested`, `approval.decided` | Identity or Authorisation | Notification capabilities |
| `approval.held` | Identity | Notification capabilities (the group's co-owners: a change waits out a recovery hold or a less safe safety period) |
| `profile.anonymised` | Profile | Domain capabilities that cached names |
| `profile.departure-anonymised` | Profile | Domain capabilities that cached a leaver's name in the group |
| `profile.request-opened`, `profile.request-completed`, `profile.request-escalated` | Profile | Operators' tooling and audit ([data-subject requests](processes/data-subject-requests.md)) |
| `profile.legal-hold-placed`, `profile.legal-hold-ended` | Profile | Audit; on ending, the host's handler erases the parts the hold deferred |
| `profile.contact-verified` | Profile | Audit; capabilities that may now use a verified contact detail, through Profile |
| `authentication.account-deleted` | Authentication | Audit |
| `authorisation.principal-erased` | Authorisation | Audit |
| `authorisation.group-disposed`, `authorisation.tenant-disposed`, `profile.group-disposed`, and each domain capability's `<capability>.group-disposed` | Each disposing member | Identity (the disposal's confirmations, through the host's [handler](adapters.md#disposal-confirmations)) |
| `<member>.retention-applied` | Each member | Audit ([retention](processes/retention.md)) |
| `authentication.sessions-revoked` | Authentication | Audit |
| `authentication.credentials-recovered` | Authentication | Identity (the recovery hold, [recovery](processes/recovery.md)) |

Rules for every event:

1. It carries an event identifier, the aggregate's identifier and version, a correlation identifier, the time and opaque identifiers only. No names, email addresses or free text.
2. Delivery is at least once. Consumers are idempotent by event identifier and ignore versions older than the one they hold.
3. Access never depends on an event arriving. Authorisation reads membership state from the directory at decision time within its consistency bound; events only invalidate caches early. Session revocation is the exception that needs an event, so Authentication also refuses sign-in and session refresh for an identity that the provisioning port reports as not `active` or `paused`.

## 5. Correlation

Every process step carries the correlation identifier of the request that started it, through ports, events and approvals, so a process can be audited end to end without personal data.

## 6. Composition

A host that uses the suite:

1. Supplies each member's persistence port (ADR-0002) with its own schema and its own database role.
2. Supplies the ports in §3 with adapters, normally the reference adapters from this repository.
3. Supplies one clock to every member (§7), or none, so that each uses the system clock.
4. Runs an outbox relay for each publishing member.
5. Applies each member's migrations in dependency order: Identity, then Authentication, Profile and Authorisation in any order.

## 7. Time

Each member reads the current time from a clock port the host may supply: `provideIdentityClock`, `provideAuthenticationClock`, `provideAuthorisationClock` and `provideProfileClock`, each taking `{ now(): Date }`. Without one, a member uses the system clock. The proposed foundation service `clock-service`, not yet specified or built, will be supplied through the same port by an adapter in this repository; no member depends on it, and until it exists the system clock is the only production clock.

- **One clock for the suite.** A host supplies the same clock to every member, or none. Times cross members (Authentication's authentication time is judged against Identity's safety periods; Profile's legal holds against Identity's closure), so two clocks would make freshness and periods disagree.
- **Every time a member keeps or judges** comes from its clock: when something happened, when a safety period, delay, hold, expiry or grace period ends, and whether an authentication is recent. A member whose database judges time (Identity's row-level checks and maintenance) gives the database the clock's time for every transaction.
- **Not the engines' own time.** Time the members delegate to a library stays on the system clock: Authentication's session lifetime, rate limits and one-time-password steps, which an authenticator app computes from real time.
- **Fails closed.** A clock that throws, or answers anything but a valid date, fails the operation as the member's `unavailable`; a member never falls back to another time.
- **A clock is trusted like a key.** Whoever supplies it can make a safety period, a closure grace period or a legal hold end early. Only the host composes it, from server code; no request can set or move it. A clock that can be moved is for tests only: the host must refuse to compose one outside a test mode, and it may only move forward. Each member records this in its threat model.

## 8. Retention and disposal

- **Legal holds are kept where their subject is.** Profile holds a person's data, by part ([data-subject requests](processes/data-subject-requests.md#legal-holds)); Identity holds groups and tenants, which are not personal data ([group deletion](processes/group-deletion.md#legal-holds-on-groups-and-tenants)). A member asks both through the legal-hold port before it deletes anything a hold might cover, and keeps the record when it cannot tell.
- **Disposal follows deletion.** A deleted group or closed tenant confers nothing at once; its information is disposed of in every member when no hold covers it, each member confirming from its own outbox, and Identity tracking the confirmations and raising any that are overdue.
- **Identity keeps tombstones** of deleted groups and closed tenants and identities: identifiers are never reused, and records naming them still resolve.
- **Retention is each member's.** Each member declares schedules for what it keeps once its purpose is over, within bounds, in the shape [retention](processes/retention.md) sets.

A host may run without Profile. Display-name lookups then return no names, and data-subject requests cover only what the other members hold.
