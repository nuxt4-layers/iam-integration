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

No member imports another. The host application composes them: it supplies each member's ports with adapters that call another member's public server functions, and it relays outbox events between them. Reference adapters for these connections will live in this repository.

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
| Authorisation | `AuthorisationDirectory` | Identity | Actor context (personal group, memberships with status) and group description (lineage, tenant), with `strong` or `bounded` consistency. Identity's directory speaks its own vocabulary (effective status including `paused`, membership kind and dates); the adapter maps `paused` to `suspended` until Authorisation contract 3 |
| Identity | Access decision | Authorisation | Whether a subject may exercise one of Identity's permissions on a group, for every change Identity does not reserve to the person themselves |
| Identity | Approval policy | Authorisation | A permission's risk level, whether an approver qualifies at decision time, and how many others qualify (to choose the approval route) |
| Profile | Disclosure context | Identity | For one viewer and a batch of subjects: each relationship (self, same group, former member, same tenant, none) and standing, and the group's departure data policy |
| Domain capabilities | Display names | Profile | Names to show for a list of identity identifiers, filtered by Profile's disclosure rules for the viewer |
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
| `group.created`, `group.renamed`, `group.reparented`, `group.owners-changed`, `group.orphaned`, `group.archived` | Identity | Authorisation (invalidate caches; assign and remove `owner`; review `group-and-descendants` assignments on reparenting) |
| `group.settings-changed` | Identity | Profile (departure data policy), Authorisation |
| `tenant.created`, `tenant.closing` | Identity | All members |
| `break-glass.used`, `break-glass.review-closed` | Identity | Host alerting to every operator and affected owner; audit |
| `invitation.accepted`, `invitation.refused` | Identity | Notification capabilities (the inviter; administrators when confirmation is needed) |
| `approval.requested`, `approval.decided` | Identity or Authorisation | Notification capabilities |
| `profile.anonymised` | Profile | Domain capabilities that cached names |
| `authentication.sessions-revoked` | Authentication | Audit |

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
3. Runs an outbox relay for each publishing member.
4. Applies each member's migrations in dependency order: Identity, then Authentication, Profile and Authorisation in any order.

A host may run without Profile. Display-name lookups then return no names, and data-subject requests cover only what the other members hold.
