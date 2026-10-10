import type { IdentityEventLike, ProfileEventLike, ProfileHeldPart } from './members'

/**
 * What the other members do when Identity announces a change
 * (architecture §4). Each handler is idempotent, so redelivery is harmless;
 * events the other members need not act on are ignored. Access never depends
 * on these: Authentication reads the standing and Authorisation the
 * directory on every decision. They end sessions promptly, remove accounts,
 * keep roles in step with ownership and membership, and give Profile the
 * events it keeps records by.
 */
export interface IdentityEventHandlerDependencies {
  /** Authentication's `revokeAuthenticationSessions`. */
  revokeSessions(principalId: string): Promise<unknown>
  /** Authentication's `discardAuthenticationAccount`. */
  discardAccount(principalId: string): Promise<unknown>
  /** Authentication's `deleteAuthenticationAccount`. */
  deleteAccount(principalId: string): Promise<unknown>
  /** Authorisation's `assignAuthorisationRole`. */
  assignRole(input: { principalId: string, groupId: string, roleId: string, actorPrincipalId: string }): Promise<unknown>
  /** Authorisation's `unassignAuthorisationRole`. */
  unassignRole(input: { principalId: string, groupId: string, roleId: string | null, actorPrincipalId: string }): Promise<unknown>
  /**
   * Profile's `applyProfileIdentityEvent`, when the host composes Profile: it
   * receives `identity.provisioned` (an empty record for a person),
   * `membership.ended` (how the leaver is shown in the group),
   * `identity.closed` (erasure), `identity.paused` and `group.renamed`
   * (parts of data-subject requests done), and `group.deleted` and
   * `group.disposal-due` (a deleted group's disposal), unchanged. Profile is
   * idempotent by event id.
   */
  applyProfileEvent?(event: IdentityEventLike): Promise<unknown>
  /** The role each membership kind holds in its group; null for none. Defaults: `member` for members, `viewer` for guests. Ignored when `defaultRoles` is given. */
  membershipRoles?: { member: string | null, guest: string | null }
  /**
   * Authorisation's `authorisationDefaultRoles`: the group's own default role
   * for a new member and a new guest (docs/processes/access-administration.md).
   * Without it, `membershipRoles` applies to every group.
   */
  defaultRoles?(groupId: string): Promise<{ member: string | null, guest: string | null }>
  /**
   * Authorisation's `eraseAuthorisationPrincipal`: removes a closed
   * identity's assignments and grants (account closure step 6).
   */
  erasePrincipal?(input: { principalId: string, actorPrincipalId: string }): Promise<unknown>
  /**
   * Profile's `profileLegalHoldParts`: the parts of a person's data under
   * legal hold now. A held part is not erased on closure; Profile's
   * `profile.legal-hold-ended` brings it back (`createProfileEventHandler`).
   */
  heldParts?(identityId: string): Promise<readonly ProfileHeldPart[]>
  /**
   * Profile's `recordProfileRequestPart`: tells Profile a member's erasure is
   * done, for any erasure request it holds for the identity.
   */
  recordRequestPart?(input: { identityId: string, part: 'authentication' | 'authorisation', correlationId: string }): Promise<unknown>
  /**
   * Break-glass rotation (ADR-0007; docs/processes/break-glass.md): after
   * every use, Authentication's `rotateAuthenticationBreakGlass` removes the
   * account's passkey and sessions and issues a new one-time enrolment link,
   * which the host delivers to the platform's operators. Without it,
   * `break-glass.used` rotates nothing, and the host must rotate by hand.
   */
  breakGlass?: BreakGlassRotation
  /**
   * Authorisation's `disposeAuthorisationGroup`: removes a deleted group's
   * assignments, grants, default roles and pending changes, and writes
   * `authorisation.group-disposed` (docs/processes/group-deletion.md). Called
   * only when the group's disposal is due, never while a hold defers it.
   */
  disposeGroup?(input: { groupId: string, correlationId: string }): Promise<unknown>
  /**
   * Authorisation's `disposeAuthorisationTenant`: removes a closed tenant's
   * custom roles and pending changes, and writes
   * `authorisation.tenant-disposed` (docs/processes/tenant-lifecycle.md).
   */
  disposeTenant?(input: { tenantId: string, correlationId: string }): Promise<unknown>
}

export interface BreakGlassRotation {
  /** Authentication's `rotateAuthenticationBreakGlass`. */
  rotate(input: { identityId: string, correlationId: string }): Promise<{ enrolmentToken: string, expiresAt: string }>
  /** The absolute URL of Authentication's break-glass enrolment page; the token goes in its fragment. */
  enrolmentUrl: string
  /** The host's delivery of the new enrolment link to the platform's operators. Never logged. */
  deliver(input: { identityId: string, link: string, expiresAt: string, correlationId: string }): Promise<void>
}

/** The erasures Authentication and Authorisation owe a closed identity, skipping held parts. */
async function eraseClosedIdentity(
  deps: Pick<IdentityEventHandlerDependencies, 'deleteAccount' | 'erasePrincipal' | 'recordRequestPart'>,
  input: { identityId: string, correlationId: string, parts: readonly ('authentication' | 'authorisation')[] },
): Promise<void> {
  const { identityId, correlationId } = input
  if (input.parts.includes('authentication')) {
    await deps.deleteAccount(identityId)
    await deps.recordRequestPart?.({ identityId, part: 'authentication', correlationId })
  }
  if (input.parts.includes('authorisation') && deps.erasePrincipal) {
    await deps.erasePrincipal({ principalId: identityId, actorPrincipalId: IDENTITY_EVENT_ACTOR })
    await deps.recordRequestPart?.({ identityId, part: 'authorisation', correlationId })
  }
}

/**
 * The Identity events Profile acts on (Profile contract §8): records,
 * departures and erasure, the evidence that closes a data-subject request's
 * restriction (`identity.paused`) and correction (`group.renamed`) parts,
 * and a deleted group's disposal.
 */
const PROFILE_EVENTS: ReadonlySet<string> = new Set([
  'identity.provisioned',
  'membership.ended',
  'identity.closed',
  'identity.paused',
  'group.renamed',
  'group.deleted',
  'group.disposal-due',
])

/** The actor recorded on role changes made because of Identity's events. */
export const IDENTITY_EVENT_ACTOR = 'iam-integration'

export function createIdentityEventHandler(deps: IdentityEventHandlerDependencies) {
  const roles = deps.membershipRoles ?? { member: 'member', guest: 'viewer' }
  const actorPrincipalId = IDENTITY_EVENT_ACTOR
  const text = (value: unknown) => (typeof value === 'string' ? value : null)

  return async function handle(event: IdentityEventLike): Promise<void> {
    if (deps.applyProfileEvent && PROFILE_EVENTS.has(event.type)) await deps.applyProfileEvent(event)
    const data = event.data
    const identityId = text(data.identityId)
    const groupId = text(data.groupId)
    switch (event.type) {
      case 'identity.paused':
      case 'identity.suspended':
      case 'identity.closure-requested':
        if (identityId) await deps.revokeSessions(identityId)
        return
      case 'identity.provisioning-expired':
        if (identityId) await deps.discardAccount(identityId)
        return
      case 'identity.closed': {
        if (!identityId) return
        const held = new Set(deps.heldParts ? await deps.heldParts(identityId) : [])
        const parts = (['authentication', 'authorisation'] as const).filter(part => !held.has(part))
        await eraseClosedIdentity(deps, { identityId, correlationId: event.correlationId, parts })
        return
      }
      case 'group.created': {
        const founder = text(data.foundingOwnerId)
        if (groupId && founder) await deps.assignRole({ principalId: founder, groupId, roleId: 'owner', actorPrincipalId })
        return
      }
      case 'group.owners-changed': {
        if (!groupId) return
        for (const added of (data.added as unknown[] | undefined) ?? []) {
          if (typeof added === 'string') await deps.assignRole({ principalId: added, groupId, roleId: 'owner', actorPrincipalId })
        }
        for (const removed of (data.removed as unknown[] | undefined) ?? []) {
          if (typeof removed === 'string') await deps.unassignRole({ principalId: removed, groupId, roleId: 'owner', actorPrincipalId })
        }
        return
      }
      case 'membership.added': {
        if (!identityId || !groupId) return
        const defaults = deps.defaultRoles ? await deps.defaultRoles(groupId) : roles
        const role = data.kind === 'guest' ? defaults.guest : defaults.member
        if (role) await deps.assignRole({ principalId: identityId, groupId, roleId: role, actorPrincipalId })
        if (data.owner === true) await deps.assignRole({ principalId: identityId, groupId, roleId: 'owner', actorPrincipalId })
        return
      }
      case 'membership.ended':
        if (identityId && groupId) await deps.unassignRole({ principalId: identityId, groupId, roleId: null, actorPrincipalId })
        return
      case 'group.deleted':
      case 'group.disposal-due':
        // A deferred disposal waits for `group.disposal-due` when the hold ends.
        if (groupId && deps.disposeGroup && (event.type === 'group.disposal-due' || data.disposal === 'due')) {
          await deps.disposeGroup({ groupId, correlationId: event.correlationId })
        }
        return
      case 'tenant.closed':
      case 'tenant.disposal-due': {
        const tenantId = text(data.tenantId)
        if (tenantId && deps.disposeTenant && (event.type === 'tenant.disposal-due' || data.disposal === 'due')) {
          await deps.disposeTenant({ tenantId, correlationId: event.correlationId })
        }
        return
      }
      case 'break-glass.used': {
        const breakGlassId = text(data.breakGlassIdentityId)
        if (!breakGlassId || !deps.breakGlass) return
        // Delivered at least once: a repeat rotates again, so only the latest link works.
        const { enrolmentToken, expiresAt } = await deps.breakGlass.rotate({ identityId: breakGlassId, correlationId: event.correlationId })
        const link = `${new URL(deps.breakGlass.enrolmentUrl).href}#${enrolmentToken}`
        await deps.breakGlass.deliver({ identityId: breakGlassId, link, expiresAt, correlationId: event.correlationId })
        return
      }
      default:
        // Other events need nothing from Authentication or Authorisation.
    }
  }
}

/**
 * What the other members do when Profile announces a change. Today one
 * event: `profile.legal-hold-ended` names the parts no hold covers any more
 * (`released`) and whether the identity has closed (`identityClosed`). For a
 * closed identity, the erasures the hold deferred on `identity.closed` happen
 * now. Profile erases its own part itself. Idempotent: every erasure is.
 */
export function createProfileEventHandler(deps: Pick<IdentityEventHandlerDependencies, 'deleteAccount' | 'erasePrincipal' | 'recordRequestPart'>) {
  return async function handle(event: ProfileEventLike): Promise<void> {
    if (event.type !== 'profile.legal-hold-ended') return
    const { identityId, released, identityClosed } = event.data
    if (typeof identityId !== 'string' || identityClosed !== true || !Array.isArray(released)) return
    const parts = (['authentication', 'authorisation'] as const).filter(part => released.includes(part))
    await eraseClosedIdentity(deps, { identityId, correlationId: event.correlationId, parts })
  }
}
