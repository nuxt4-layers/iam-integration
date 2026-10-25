# IAM Suite Host Contract

What a host needs to compose the IAM suite (Identity, Authentication, Authorisation, Profile and these adapters), and nothing else ([ADR-0012](https://github.com/nuxt4-layers/platform-architecture/blob/60ee7d51f4f7c186b6e710b4409d8f2a7719aad0/docs/decisions/ADR-0012-trivial-composition.md#6-a-one-page-host-contract) §6). The members' own contracts and this repository's documents stay the source: where this page disagrees with them or the code, this page is the bug. ADR-0012's single call returning `resolveCaller`, `decide` and `tasks` is not built yet, so today the host wires the adapters below itself.

## Install

```json
"@nuxt4-layers/identity": "github:nuxt4-layers/identity#v1.0.0",
"@nuxt4-layers/authentication": "github:nuxt4-layers/authentication#v1.0.0",
"@nuxt4-layers/authorisation": "github:nuxt4-layers/authorisation#v1.0.0",
"@nuxt4-layers/profile": "github:nuxt4-layers/profile#v1.1.0",
"@nuxt4-layers/iam-integration": "github:nuxt4-layers/iam-integration#v1.1.0"
```

`extends` all five in `nuxt.config.ts`; install with `--frozen-lockfile`. One Nitro plugin (members' functions are auto-imported; adapters come from `@nuxt4-layers/iam-integration/adapters`):

```ts
const subject = identitySubjectResolverFromAuthentication({ getAuthenticatedPrincipal })
const catalogue = [...IDENTITY_PERMISSIONS, ...PROFILE_PERMISSIONS]
provideAuthorisationPermissions(catalogue)
provideAuthorisationPolicy({ roles: rolesWithIdentityPermissions({ permissions: catalogue, roles: DEFAULT_AUTHORISATION_POLICY.roles }) })
provideIdentityDatabase({ dialect: 'postgres', pool: identityRuntimePool })
provideIdentityAccessDecision(identityAccessDecisionFromAuthorisation({ authorise }))
provideIdentityApprovalPolicy(identityApprovalPolicyFromAuthorisation({ riskOf, qualifies: authorisationQualifies, countQualifying: countAuthorisationQualifying }))
provideIdentityEventPublisher(identityEvents) // its publish runs the handlers under "Host passes"
provideIdentitySubjectResolver(subject)
provideIdentityPolicy({ platformGroupId: process.env.IDENTITY_PLATFORM_GROUP_ID ?? null })
provideAuthenticationDatabase({ dialect: 'postgres', pool })
provideAuthenticationMailer(mailer)
provideAuthenticationIdentity(authenticationIdentityFromIdentity({ provisioning: getIdentityProvisioning() }))
provideAuthenticationServiceGovernance(authenticationServiceGovernanceFromIdentity({ services: getIdentityServiceIdentities() }))
provideAuthenticationLegalHolds(legalHoldsFromMembers({ part: 'authentication', groupOrTenantHeld: identityLegalHoldCovers, personHeldParts: profileLegalHoldParts }))
provideAuthorisationDatabase({ dialect: 'postgres', pool })
provideAuthorisationDirectory(authorisationDirectoryFromIdentity({ directory: getIdentityDirectory() }))
provideAuthorisationGovernance(authorisationGovernanceFromIdentity({ governance: getIdentityAccessGovernance() }))
provideAuthorisationSubjectResolver({ resolve: getAuthenticatedPrincipal })
provideAuthorisationLegalHolds(legalHoldsFromMembers({ part: 'authorisation', groupOrTenantHeld: identityLegalHoldCovers, personHeldParts: profileLegalHoldParts }))
provideProfileDatabase({ dialect: 'postgres', pool: profileRuntimePool, migrationPool, runtimeRole: 'profile_runtime' })
provideProfileKeyWrapper(kmsKeyWrapper)
provideProfileDisclosureContext(getIdentityDisclosureContext())
provideProfileSubjectResolver(subject)
provideProfileAccessDecision(profileAccessDecisionFromAuthorisation({ authorise }))
provideProfileRequestCoordinator(profileRequestCoordinatorFromMembers({ exportIdentity: exportIdentityData, exportAuthentication: exportAuthenticationData, exportAuthorisation: exportAuthorisationData }))
provideProfileNotifier(notifier)
await migrateAuthenticationDatabase(); await migrateAuthorisationDatabase(); migrateProfileDatabase()
```

Run `migrateIdentityDatabase({ pool: migrationPool, runtimeRole })` at deployment, before the others.

## Settings

| Setting | Default | Does |
|---|---|---|
| `NUXT_IDENTITY_BASE_URL`, `NUXT_AUTHENTICATION_BASE_URL`, `NUXT_AUTHORISATION_BASE_URL`, `NUXT_PROFILE_BASE_URL` | None | The public `https` origin. State-changing requests from any other `Origin` are refused; unset refuses all |
| `NUXT_AUTHENTICATION_SECRET` | None | At least 32 random bytes from the secret manager; the first request fails without it |
| `NUXT_AUTHENTICATION_PROVIDERS_<ID>_CLIENT_ID`, `_CLIENT_SECRET` (`_TENANT_ID` for Microsoft, `_DISCOVERY_URL` and `_NAME` for `oidc`) | Off | Enables `google`, `microsoft`, `github`, `facebook` or `oidc`. Redirect URI: `<base URL>/api/authentication/federation/callback/<id>` |
| `NUXT_AUTHENTICATION_TRUST_PROXY` | `false` | `true` only behind a proxy that overwrites `X-Forwarded-For` |
| `IDENTITY_PLATFORM_GROUP_ID` (host's own, into `provideIdentityPolicy`) | None | The platform group whose owners are the operators. Without it, root groups, suspensions and break-glass reviews are refused |
| `NUXT_PUBLIC_IDENTITY_LOCALE`, `NUXT_PUBLIC_PROFILE_LOCALE`, `NUXT_PUBLIC_AUTHORISATION_LOCALE`; `authentication.locale` | `en-GB` | Locale of each member's screens and mail |
| `identity.routes.signIn`, `profile.routes.signIn` (`NUXT_PUBLIC_*_ROUTES_SIGN_IN`) | `/sign-in` | Where Identity's and Profile's pages send a signed-out person |
| `profile.routes.closeAccount` (`NUXT_PUBLIC_PROFILE_ROUTES_CLOSE_ACCOUNT`) | None | The page where a person closes their account: how they have their data deleted |
| `authentication.routes.*` | §Screens | Redirect and email-link targets; kept in step with moved pages |
| `provideAuthenticationPolicy`, `provideAuthorisationPolicy`, `provideIdentityPolicy`, `provideProfileRetention` | Secure defaults | Overrides within floors; loosening any default needs a documented risk treatment |

## Host passes

| Need | Shared shape (ADR-0012 §2) | Today |
|---|---|---|
| Database | A `pg` pool per member, each its own schema and role | Identity: a runtime role that owns nothing, no `BYPASSRLS`, and a separate migration pool. Profile: runtime and migration pools |
| Mail | `send({ to, template, data })` | Authentication's `send(AuthenticationMessage)` (`kind`, `to`, `locale`, `actionUrl`, `expiresAt`); Profile's `send({ channel, to, code, ... })`; invitations' `deliver` (`invitationSenderFromIdentity`); break-glass links and service-credential notices to operators and owners |
| Keys | Not a shared shape | Profile's key wrapper over a KMS, HSM or vault (`createLocalProfileKeyWrapper({ keys, current })` otherwise). No default key |
| Events | Each outbox, drained by `relay()` | `relayIdentityOutbox` → `createIdentityEventHandler({ revokeSessions, discardAccount, deleteAccount, assignRole, unassignRole, defaultRoles, erasePrincipal, applyProfileEvent, heldParts, recordRequestPart, breakGlass, disposeGroup, disposeTenant })`; `relayProfileOutbox` → `createProfileEventHandler` and `createDisposalConfirmationHandler`; `relayAuthorisationOutbox` → `createDisposalConfirmationHandler`; Authentication's event sink → `createAuthenticationEventHandler` and `createServiceCredentialNoticeHandler`. Forward all to audit |
| Scheduled work | `tasks: { name, every, run }[]` | `runIdentityMaintenance` and `runAuthorisationMaintenance` every few minutes; `runAuthenticationMaintenance`, `runProfileMaintenance` and `reconcileCredentialRecoveries` hourly; relays every minute. All idempotent |
| Clock | `now()`, system clock by default | The same `{ now(): Date }` to all four `provide*Clock`, or none. Never a movable clock outside tests |
| Caller, Access | `resolveCaller`, `decide` | Not offered yet. Other capabilities take `getAuthenticatedPrincipal(event)` and Authorisation's `authorise` |

## Client and server functions

| Member | Client (decides nothing) | Server functions screens and other capabilities call |
|---|---|---|
| Authentication | `useAuthentication()`: `principal`, `signIn`, `signUp`, `signInWithPasskey`, `reauthenticate`, `signOut`, MFA, passkeys, sessions; each `{ ok, data }` or `{ ok: false, code }` | `getAuthenticatedPrincipal(event)` → principal or null; `requireAuthenticatedPrincipal(event, requirement?)` (defaults to `aal2`) |
| Identity | `useIdentity()`: one function per `/api/identity/*` endpoint | `getIdentityQueries()`, `getIdentityGovernance()`, `getIdentityApprovals()`, `getIdentityJoining()`, `getIdentityLifecycle()`, each taking the `subject` and a `correlationId` |
| Authorisation | `useAuthorisation()`, with `share(input, justification)` for a domain capability's `grant.create` | `authorise({ subject, permission, resource })` → `{ allowed }` or a reason with a step-up requirement; `requireAuthorisation(input)`; `listAuthorisationVisibleGroups` |
| Profile | `useProfile()`, `useProfileNames()`, `forgetProfileNames()` | `lookupProfileDisplayNames({ viewerId, subjectIds, groupId?, purpose })`, up to 200, in order |
| Adapters | | `invitationSenderFromIdentity({ joining, deliver, acceptanceUrl }).send(...)` behind the host's invitation endpoint; `tenantExportFromMembers(...).exportTenant(...)` behind its export endpoint |

Errors are `{ code, messageKey, reason? }`: `unauthenticated` 401, `forbidden` 403, `insufficient-assurance` 403, `validation-failed` 400, `conflict` 409, `rate-limited` 429, `unavailable` 503. Authentication adds `invalid-credentials`, `reauthentication-required`, `account-restricted`, `origin-rejected`, `credential-limit-reached` and others in `AUTHENTICATION_ERROR_CODES`.

## Permissions

Add `IDENTITY_PERMISSIONS` and `PROFILE_PERMISSIONS` to Authorisation's catalogue, and name them in `owner` and `administrator` with `rolesWithIdentityPermissions`: wildcards never cover `high` or `critical`. Risk sets step-up: `high` needs `aal2`; `critical` needs `aal2`, phishing resistant, within 15 minutes.

| Risk | Permissions |
|---|---|
| low | `identity.groups:view`, `identity.memberships:view`, `identity.tenants:view`, `authorisation.roles:view` |
| medium | `identity.groups:create`, `identity.groups:rename`, `identity.invitations:manage`, `identity.join-requests:decide`, `identity.memberships:remove`, `:suspend`, `:schedule`; `authorisation.role-assignments:manage` (an assignment takes its role's risk) |
| high | `identity.root-groups:create`, `identity.groups:archive`, `identity.group-settings:manage`, `identity.service-identities:create`, `:manage`, `identity.identities:suspend`, `identity.break-glass-reviews:close`; `authorisation.grants:manage`, `authorisation.group-access:manage`; `profile.suspended-people:view` (names a group's suspended members to its administrators) |
| critical | `identity.groups:reparent`, `identity.group-approvals:manage`, `identity.group-owners:manage`, `identity.orphaned-groups:recover`, `identity.tenants:manage`; `authorisation.roles:manage` |

## Screens

Each member ships a presentation part, styled only with Theme Manager's vocabulary. Import `@nuxt4-layers/theme-manager/presentation.css`, then each member's `tailwind.css`. Move pages with `<member>: { pages: { paths } }`, keep only components with `pages: { enabled: false }`, or turn all off with `presentation: false`.

| Member | Pages (default paths) |
|---|---|
| Authentication | `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, `/mfa`, `/account/security`, `/break-glass/enrol` |
| Identity | `/account/groups`, `/groups/:groupId`, `/invitations/accept`, `/changes/:changeId` |
| Authorisation | `/groups/:groupId/access`, `/groups/:groupId/sharing`, `/tenants/:tenantId/roles`, `/access-changes/:changeId` |
| Profile | `/profile`, `/profile/people/:subjectId`, `/profile/departures`, `/profile/requests` |

Wording: each member's en-GB catalogue (`<member>.*` keys; errors `<member>.error.<code>`, rule reasons `identity.reason.*`, `profile.reason.*`), overridden per locale in `app.config.ts` under `<member>.messages`. Names: back `IdentityPersonName` and `AuthorisationPersonName` with components of those names that render `ProfilePersonName`, and `ProfileGroupName` with Identity's `formerGroupNames`. Without them, people show as opaque placeholders.

## Headless surface

A screen the host draws itself must still:

- take the signed-in person only from the server's subject resolver, never from a request body, and decide nothing: every action is decided again on the server;
- send administration, account and profile pages with `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer` and `Cache-Control: no-store`;
- carry an invitation or break-glass token in the URL fragment (`#token`), never the query; honour `redirect` only through `safeRedirectPath`;
- use `autocomplete` `email` or `username`, `current-password`, `new-password` and `one-time-code` on credential fields, and show `invalid-credentials` without saying whether an account exists;
- show an unknown, hidden or refused person, group or record alike, and name people only through Profile's lookup;
- send a change's `changeDigest` with its decision, and a profile edit with its `expectedVersion`, reloading on `conflict`;
- meet WCAG 2.2 AA in light and dark mode.

## You will hit this

- Every identifier of a person, group, tenant or membership is an opaque UUIDv7 issued by Identity; Authentication's `principalId`, Authorisation's principal and Profile's key are the identity identifier. Events and logs carry identifiers only.
- Apply Identity's migrations first. Tenants, first root groups and break-glass accounts are created only by operator functions with the migration pool, never over HTTP.
- A missing required port throws `<Member>CompositionError` at first use; nothing falls back. A failing port, database or clock answers `unavailable`.
- `forbidden` also means "does not exist"; `reason` comes only with `conflict` and `validation-failed`.
- Group names are safe names: confusable or unsafe ones are `validation-failed`, a confusable sibling `conflict`.
- Owners follow Identity: never assign or remove `owner` through Authorisation. Nobody grants themselves access or approves their own change (`self-grant`, `own-request`).
- `high` and `critical` changes need approvers, else an owner of the parent or root group, else a published delay. A change soon after a credential recovery is held.
- Pausing, closing an account, changing a contact detail and downloading data need a sign-in within 15 minutes.
- Service identities never request or approve access changes, and never get a `critical` permission.
- Creating an invitation is the host's endpoint: the address never reaches Identity.
- MFA is required by default; `requireAuthenticatedPrincipal` refuses `aal1` sessions unless asked for `aal1`.
