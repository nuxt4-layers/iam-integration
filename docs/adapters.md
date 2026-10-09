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

Every adapter rejects when the member it calls fails, so the consuming member fails closed.

## Roles

Authorisation's wildcards never cover `high` or `critical` permissions. `rolesWithIdentityPermissions({ permissions: IDENTITY_PERMISSIONS, roles: DEFAULT_AUTHORISATION_POLICY.roles })` names Identity's in the built-in roles: every high and critical one in `owner`; the high ones that run a group in `administrator` (never ownership, approvals, reparenting, creating root groups, suspending identities or closing break-glass reviews). Pass the result to `provideAuthorisationPolicy({ roles })`.

## Events

`createIdentityEventHandler(...)` handles Identity's events from its outbox relay. Each handler is idempotent, and access never depends on it: Authentication reads the standing and Authorisation the directory at every decision.

| Identity event | Action |
|---|---|
| `identity.paused`, `identity.suspended`, `identity.closure-requested` | Authentication's `revokeAuthenticationSessions` |
| `identity.provisioning-expired` | Authentication's `discardAuthenticationAccount` |
| `identity.closed` | Authentication's `deleteAuthenticationAccount` |
| `group.created` | The founding owner gets `owner` in the group |
| `group.owners-changed` | Owners added get `owner`; owners removed lose it |
| `membership.added` | The membership kind's role (`member`, or `viewer` for guests; configurable), and `owner` for an owner |
| `membership.ended` | Every role in the group is removed |

Role changes are recorded with the actor `iam-integration`.

## Credential recovery

`createAuthenticationEventHandler({ record })` passes `authentication.credentials-recovered` to Identity's `recordIdentityCredentialRecovery`. `reconcileCredentialRecoveries({ list, record, after })` replays Authentication's durable records (`listAuthenticationCredentialRecoveries`) page by page and returns the cursor to resume from, so a lost event never skips the [recovery hold](processes/recovery.md). Identity keeps the latest recovery, so replaying is harmless.

## Commands

`pnpm install`, then `pnpm check` (type check and tests).
