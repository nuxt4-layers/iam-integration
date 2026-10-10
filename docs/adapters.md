# Reference Adapters

`@nuxt4-layers/iam-integration` holds the reference adapters between the members' ports ([architecture](architecture.md) §3, §4), exported at `@nuxt4-layers/iam-integration/adapters` (`server/adapters/`). They are server code, so they sit under `server/` as the members' server code does; not under `server/utils/`, which Nuxt would auto-import into the host's server scope, because a host imports and wires each adapter explicitly. A host `extends` the package as a Nuxt layer, which adds nothing at runtime but has the adapters' TypeScript compiled with the host's server code, as the members' is. The adapters import no member: a host passes in the members' public server functions, and the adapters translate between their vocabularies. They store nothing and decide nothing a member owns. `server/adapters/members.ts` names, structurally, what each adapter needs of a member; a host's type check proves the real functions fit.

## Ports

| Adapter | Supplies | From | Translation |
|---|---|---|---|
| `authenticationIdentityFromIdentity({ provisioning })` | Authentication's `AuthenticationIdentity` (`provideAuthenticationIdentity`) | Identity's `getIdentityProvisioning()` | `reserve` with a fresh UUIDv7 request identifier and no personal data, passing only an invitation token Identity can use; `confirm`; `standing` from `signInStatus` (same outcome names, `passkeyOnly` for break-glass) |
| `identitySubjectResolverFromAuthentication({ getAuthenticatedPrincipal })` | Identity's `IdentitySubjectResolver` | Authentication's `getAuthenticatedPrincipal(event)` | The principal's identifier, authentication time, level and phishing resistance only |
| `authorisationDirectoryFromIdentity({ directory })` | Authorisation's `AuthorisationDirectory` | Identity's `getIdentityDirectory()` | `identityId` becomes `principalId`; each membership's effective status passes through, `paused` included; the identity's state becomes the principal's `status` (`active`, `paused`, otherwise `suspended`); consistency passed through (Authorisation contract 3) |
| `identityAccessDecisionFromAuthorisation({ authorise })` | Identity's `IdentityAccessDecision` | Authorisation's `authorise` | The resource is the group itself, of the permission's type, owned by the group; reasons collapse to `not-permitted` or `insufficient-assurance` with its requirement |
| `identityApprovalPolicyFromAuthorisation({ riskOf, qualifies, countQualifying })` | Identity's `IdentityApprovalPolicy` | Authorisation's `authorisationQualifies` and `countAuthorisationQualifying`, and the catalogue the host supplied | The same group resource; the requester excluded from the count |
| `authorisationGovernanceFromIdentity({ governance })` | Authorisation's `AuthorisationGovernance` (`provideAuthorisationGovernance`) | Identity's `getIdentityAccessGovernance()` | A group's approval requirement and safety periods in force, its parent and root, whose personal group it is, the requester's recovery hold and controlled identities, and Identity's record of owners ([access administration](processes/access-administration.md)); the identity identifier becomes the principal identifier |
| `profileAccessDecisionFromAuthorisation({ authorise })` | Profile's `ProfileAccessDecision` | Authorisation's `authorise` | The same group resource, for Profile's permissions (`profile.suspended-people:view`); every refusal, insufficient assurance included, is `false`, so Profile shows what it shows anyone |
| `profileRequestCoordinatorFromMembers({ exportIdentity, exportAuthentication, exportAuthorisation })` | Profile's `ProfileRequestCoordinator` | Identity's `exportIdentityData`, Authentication's `exportAuthenticationData`, Authorisation's `exportAuthorisationData` | One member's part of an access request ([data-subject requests](processes/data-subject-requests.md)): the identity identifier becomes the principal identifier for Authentication and Authorisation; a member the host does not compose holds nothing (null); a failing member rejects its own part only |

| `legalHoldsFromMembers({ part, groupOrTenantHeld, personHeldParts })` | Each member's legal-hold port, for its retention and disposal ([retention](processes/retention.md)) | Identity's `identityLegalHoldCovers` and Profile's `profileLegalHoldParts` | `covers({ kind, id })`: a group or tenant asks Identity (a group is covered through its tenant too); a person asks Profile whether the asking member's `part` is held. Without Profile no person is held, since only Profile places such holds |

Every adapter rejects when the member it calls fails, so the consuming member fails closed.

## Invitations

`invitationSenderFromIdentity({ joining, deliver, acceptanceUrl })` is the host's invitation endpoint's back end ([joining and leaving](processes/joining-and-leaving.md)). `send({ subject, groupId, kind, address, ... })` asks Identity's `getIdentityJoining().invite` for an invitation bound to nobody, and hands `deliver` (the host's notification capability) the address and a link to Identity's acceptance page with the token in the fragment. It looks the address up nowhere and keeps neither, so the answer is the same whatever the address. An address that is not printable or longer than 320 characters is refused before Identity is asked (`InvitationAddressError`); whether it can receive mail is delivery's to judge. If delivery refuses the message, the invitation is revoked and the call rejects, so no token is left that nobody holds.

## Time

The members' clock ports (`provideIdentityClock`, `provideAuthenticationClock`, `provideAuthorisationClock`, `provideProfileClock`) take `{ now(): Date }` directly, so they need no adapter: a host passes the same clock to each, or none ([architecture](architecture.md) §7). When the proposed `clock-service` exists, its adapter will live here.

## Roles

Authorisation's wildcards never cover `high` or `critical` permissions. `rolesWithIdentityPermissions({ permissions: [...IDENTITY_PERMISSIONS, ...PROFILE_PERMISSIONS], roles: DEFAULT_AUTHORISATION_POLICY.roles })` names Identity's and Profile's in the built-in roles: every high and critical one in `owner`; the high ones that run a group in `administrator` (never ownership, approvals, reparenting, creating root groups, suspending identities, closing break-glass reviews or a closing tenant's governance export). Pass the result to `provideAuthorisationPolicy({ roles })`.

Profile's `profile.suspended-people:view` (a suspended member's name, to the group's administrators) is `high` because it discloses personal data: so the `*:view` wildcards of `member` and `viewer` never reach it, `owner` and `administrator` hold it by name, and it needs `aal2`. An administrator signed in at `aal1` sees a suspended member as anyone else does.

## Events

`createIdentityEventHandler(...)` handles Identity's events from its outbox relay. Each handler is idempotent, and access never depends on it: Authentication reads the standing and Authorisation the directory at every decision.

| Identity event | Action |
|---|---|
| `identity.paused`, `identity.suspended`, `identity.closure-requested` | Authentication's `revokeAuthenticationSessions` |
| `identity.provisioning-expired` | Authentication's `discardAuthenticationAccount` |
| `identity.closed` | Authentication's `deleteAuthenticationAccount`, then Authorisation's `eraseAuthorisationPrincipal` (`erasePrincipal`), each unless a legal hold covers it |
| `group.created` | The founding owner gets `owner` in the group |
| `group.owners-changed` | Owners added get `owner`; owners removed lose it |
| `membership.added` | The group's default role for the membership kind, from Authorisation's `authorisationDefaultRoles` (`defaultRoles`), or else `member`, or `viewer` for guests (configurable); and `owner` for an owner |
| `membership.ended` | Every role in the group is removed |
| `group.deleted`, `group.disposal-due` | With `disposeGroup`, Authorisation's `disposeAuthorisationGroup`, when disposal is due ([below](#group-and-tenant-disposal)) |
| `tenant.closed`, `tenant.disposal-due` | With `disposeTenant`, Authorisation's `disposeAuthorisationTenant`, when disposal is due |
| `break-glass.used` | With `breakGlass`, Authentication's `rotateAuthenticationBreakGlass` removes the account's passkey and sessions, and the new enrolment link goes to the host's `deliver` for the platform's operators ([break-glass access](processes/break-glass.md)) |

With `applyProfileEvent` (Profile's `applyProfileIdentityEvent`), the handler first passes `identity.provisioned`, `membership.ended`, `identity.closed`, `identity.paused`, `group.renamed`, `group.deleted` and `group.disposal-due` to Profile unchanged: Profile creates a person's empty record, keeps how a leaver is shown in the group, erases the record on closure (unless held), marks the parts of data-subject requests these events complete, and disposes of a deleted group's departure records and pseudonyms when disposal is due. Profile is idempotent by event id, and a failure rejects the event so that Identity's relay delivers it again. Profile reads pausing and suspension from Identity's disclosure-context port, not from events.

Profile's notification port (`ProfileNotifier`, for contact-detail verification codes) is the host's own delivery, not another member's. Profile's other ports need no adapter: Identity's `getIdentityDisclosureContext()` already has the shape of `ProfileDisclosureContext`, and `identitySubjectResolverFromAuthentication` returns the subject Profile's `ProfileSubjectResolver` expects.

Role changes and erasures are recorded with the actor `iam-integration`.

### Legal holds

With `heldParts` (Profile's `profileLegalHoldParts`), the handler reads, on `identity.closed`, which parts of the person's data are under legal hold ([data-subject requests](processes/data-subject-requests.md#legal-holds)), and erases only the others. If the holds cannot be read, the event fails and is delivered again: nothing that might be held is erased. With `recordRequestPart` (Profile's `recordProfileRequestPart`), it tells Profile each erasure is done, for any erasure request Profile holds.

`createProfileEventHandler({ deleteAccount, erasePrincipal, recordRequestPart })` handles Profile's events. On `profile.legal-hold-ended` for an identity that has closed, it carries out the erasures the hold deferred, for the parts no hold covers any more (`released`). Profile erases its own part itself.

### Group and tenant disposal

Identity says in `group.deleted` and `tenant.closed` whether disposal is `due` or `deferred` by one of its legal holds, and writes `group.disposal-due` or `tenant.disposal-due` when the hold ends ([group deletion](processes/group-deletion.md), [tenant lifecycle](processes/tenant-lifecycle.md)). The handler therefore needs no hold lookup of its own: it calls `disposeGroup` or `disposeTenant` only when disposal is due, and never while it is deferred. A failure rejects the event, so the relay delivers it again; disposal is idempotent. A deleted group's memberships end before `group.deleted` with `membership.ended` as usual, so its roles are removed then too.

## Disposal confirmations

`createDisposalConfirmationHandler({ record })` takes events from every disposing member's relay (Authorisation, Profile and domain capabilities) and passes each `<member>.group-disposed` (`groupId`) and `<member>.tenant-disposed` (`tenantId`) to Identity's `recordIdentityDisposal`, naming the member by the event's prefix. Identity decides whether it expected that member (its `disposalParticipants`), keeps the confirmation, and raises a disposal not confirmed within 7 days. Other events, and confirmations claiming to be Identity's own, are ignored.

## Tenant export

`tenantExportFromMembers({ exportIdentityTenant, exportAuthorisationTenant })` is the back end of the host's governance export endpoint during a tenant's notice period ([tenant lifecycle](processes/tenant-lifecycle.md#governance-export)). `exportTenant({ subject, tenantId, correlationId })` asks Identity first, which decides whether the subject may have it (an owner of the tenant's root group, at `aal2`, while the tenant is `closing`) and rejects otherwise; only then is Authorisation's server-only part asked for, for the groups Identity's part names. It returns both parts unchanged, or null for a tenant Identity does not know; any failure rejects the whole export. It holds identifiers, never personal data, and the adapter keeps nothing.

## Credential recovery

`createAuthenticationEventHandler({ record })` passes `authentication.credentials-recovered` to Identity's `recordIdentityCredentialRecovery`. `reconcileCredentialRecoveries({ list, record, after })` replays Authentication's durable records (`listAuthenticationCredentialRecoveries`) page by page and returns the cursor to resume from, so a lost event never skips the [recovery hold](processes/recovery.md). Identity keeps the latest recovery, so replaying is harmless.

## Commands

`pnpm install`, then `pnpm check` (type check and tests).
