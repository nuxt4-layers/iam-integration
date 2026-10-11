# Operating the Suite

What a host does to run Identity, Authentication, Authorisation and Profile together in production: composition, databases, secrets and keys, scheduled work, events, operator procedures and monitoring. Each member's own README and contract remain the source for its functions; this guide puts the host's duties in one place. [Architecture](architecture.md) §6 lists the composition order and [adapters](adapters.md) the wiring between members.

## 1. Composition

1. Extend each member as a Nuxt layer, installed from Git pinned to a tag or commit, with the lockfile committed and `pnpm install --frozen-lockfile` in CI. Extend `@nuxt4-layers/iam-integration` too, for the adapters.
2. In one Nitro plugin per member, supply its ports. Required ports fail closed when absent; a member never falls back to an in-memory or file store.
3. Wire members to one another only through the [reference adapters](adapters.md). Members never import one another, and the host never passes one member's database to another.
4. Supply one clock to every member, or none ([architecture](architecture.md) §7). Never compose a movable clock outside a test mode.
5. A host may run without Profile; names then appear nowhere and data-subject requests cover the other members only.

## 2. Databases

| Member | Migration | Runtime | Notes |
|---|---|---|---|
| Identity | `migrateIdentityDatabase({ pool: migrationPool, runtimeRole })` with the migration role, at deployment | `provideIdentityDatabase` with a runtime role that owns nothing and never has `BYPASSRLS` | Row-level security per tenant; tables that span tenants are reached only through `SECURITY DEFINER` functions. Tenants and their first root groups are created with the migration pool only (§5) |
| Authentication | `migrateAuthenticationDatabase()` | `provideAuthenticationDatabase` | Its own schema |
| Authorisation | `migrateAuthorisationDatabase()` | `provideAuthorisationDatabase` | Its own schema |
| Profile | `migrateProfileDatabase()` | `provideProfileDatabase` | Its own schema; attribute values are encrypted before they reach it (§3) |

- Apply migrations in dependency order: Identity first, then the others in any order. Migrations are append-only; never edit or reorder one.
- Give each member its own schema and its own database role (ADR-0002). PostgreSQL 16 is the tested version.
- Back up every member's schema together, at one point in time, so that cross-member identifiers stay consistent on restore. A restore re-runs nothing: relays resume from what each outbox marked as delivered, and consumers are idempotent by event identifier.

## 3. Secrets and keys

| Secret | Member | Duty |
|---|---|---|
| `NUXT_AUTHENTICATION_SECRET` | Authentication | At least 32 random bytes from the deployment's secret manager; never committed |
| Federation client secrets (`NUXT_AUTHENTICATION_PROVIDERS_<ID>_CLIENT_SECRET`) | Authentication | Only for providers that are enabled |
| Profile's key wrapper (`provideProfileKeyWrapper`) | Profile | Wraps each person's data key with a versioned host key, ideally a KMS, HSM or vault. `createLocalProfileKeyWrapper({ keys, current })` takes keys from the secret manager for hosts without one. There is no default key |
| The clock | All | Trusted like a key: only server code composes it ([architecture](architecture.md) §7) |

**Rotating Profile's key.** Add the new version to the wrapper and make it `current`; run `rewrapProfileKeys({ limit })` until it returns 0; confirm with `profileKeyVersionsInUse()` that no key uses the old version; then remove the old version. Erased people's keys are gone, so they are never re-wrapped.

## 4. Configuration

Set each member's base URL to the host's public `https` origin: `NUXT_IDENTITY_BASE_URL`, `NUXT_AUTHENTICATION_BASE_URL`, `NUXT_AUTHORISATION_BASE_URL` and `NUXT_PROFILE_BASE_URL`. State-changing requests whose `Origin` does not match are refused, and none configured refuses all. Set `NUXT_AUTHENTICATION_TRUST_PROXY` only behind a proxy that overwrites `X-Forwarded-For`. Serve over TLS only; the members set their own cookie, framing and caching headers, and the host adds transport security (HSTS) at its edge.

Loosening any member's default policy (password length, approval requirements, safety periods, retention) needs a documented risk treatment in the host's own records, as each member's threat model requires for itself.

## 5. Operator procedures

These run from server-only code the platform operator controls, never from an endpoint.

| Procedure | Functions | Process |
|---|---|---|
| Provision a tenant and its first root group | `provisionIdentityTenant`, `bootstrapIdentityRootGroup` (migration pool) | [Provisioning](processes/provisioning.md) |
| Provision break-glass accounts | `provisionIdentityBreakGlass`, `provisionAuthenticationBreakGlass`; rotation after use through the event handler | [Break-glass access](processes/break-glass.md) |
| Data-subject requests and legal holds on people | Profile's request and legal-hold functions (`openProfileRequest`, `placeProfileLegalHold`, ...) | [Data-subject requests](processes/data-subject-requests.md) |
| Legal holds on groups and tenants, group deletion, tenant closure | Approved changes through `getIdentityApprovals()` | [Group deletion](processes/group-deletion.md), [tenant lifecycle](processes/tenant-lifecycle.md) |
| Role documents between environments | `exportAuthorisationRoles`, `importAuthorisationRoles` | [Access administration](processes/access-administration.md) |
| A closing tenant's governance export | `exportIdentityTenantData`, `exportAuthorisationTenantData` | [Tenant lifecycle](processes/tenant-lifecycle.md) |

## 6. Scheduled work

Run each with any scheduler, a few minutes apart; each is safe to run again and in parallel with requests.

| Job | Cadence | What happens if it stops |
|---|---|---|
| `runIdentityMaintenance()` | Every few minutes | Pending changes, delays, holds, provisioning expiry, membership windows and disposal deadlines wait. Access still never outlives its end: every read checks dates |
| `runAuthenticationMaintenance()` | Hourly | Records past retention are kept longer |
| `runAuthorisationMaintenance()` | Every few minutes | Expired assignments stay in the table but confer nothing; approved delayed changes wait |
| `runProfileMaintenance()` | Hourly | Holds, archives, request escalation and expired codes wait |
| `relayIdentityOutbox`, `relayAuthorisationOutbox`, `relayProfileOutbox` | Every minute, or continuously | Events wait in the outbox, in order; nothing is lost |
| `reconcileCredentialRecoveries` | Hourly | A lost `authentication.credentials-recovered` event is replayed late; the [recovery hold](processes/recovery.md) starts late |

## 7. Events

Relay Identity's events to `createIdentityEventHandler` ([adapters](adapters.md#events)), Authentication's event sink to `createAuthenticationEventHandler` and `createServiceCredentialNoticeHandler`, and disposal confirmations from Authorisation's and Profile's outboxes to `recordIdentityDisposal`. A handler that fails rejects, so the relay delivers the event again; handlers are idempotent. Access never depends on an event arriving: members read standing and memberships at every decision.

Forward every member's events to the host's audit store. They carry identifiers, codes and times only, so the audit store holds no personal data from them.

## 8. Monitoring

Alert on:

- an outbox whose oldest undelivered event is older than a few minutes, or a relay that keeps failing;
- a maintenance job that has not completed within twice its cadence;
- any `unavailable` error rate above normal: a port, the database or the clock is failing, and the members are failing closed;
- `break-glass.used`, `authentication.credentials-recovered` for an operator, and any `critical` change applied;
- disposal confirmations that Identity reports overdue;
- `authorisation.review-overdue` and `authorisation.denied` spikes, for the owners concerned.

## 9. Upgrades

Upgrade one member at a time, to a tagged release, reading its CHANGELOG. Apply its migrations before serving the new code. A member's contract version changes only with a major release; the adapters here state the shapes they need (`server/adapters/members.ts`), so the host's type check proves the members still fit. Run `platform-test-harness` against the new set before deploying.

## 10. Members' own guidance

- Identity: [README](https://github.com/nuxt4-layers/identity/blob/796b345eb6ef267c8a3e7b4c8ba1d6136078d51f/README.md), [threat model](https://github.com/nuxt4-layers/identity/blob/796b345eb6ef267c8a3e7b4c8ba1d6136078d51f/docs/threat-model.md)
- Authentication: [README](https://github.com/nuxt4-layers/authentication/blob/08f0f24a3be9e34d9a11f1002ea735c8437fdd70/README.md), [threat model](https://github.com/nuxt4-layers/authentication/blob/08f0f24a3be9e34d9a11f1002ea735c8437fdd70/docs/threat-model.md)
- Authorisation: [README](https://github.com/nuxt4-layers/authorisation/blob/7d4d02e53b2e59432b56652d2594b9c44b1fa934/README.md), [threat model](https://github.com/nuxt4-layers/authorisation/blob/7d4d02e53b2e59432b56652d2594b9c44b1fa934/docs/threat-model.md)
- Profile: [README](https://github.com/nuxt4-layers/profile/blob/b0cecf6a7ee524e5b2154206b6ec397b64619c34/README.md), [threat model](https://github.com/nuxt4-layers/profile/blob/b0cecf6a7ee524e5b2154206b6ec397b64619c34/docs/threat-model.md)
