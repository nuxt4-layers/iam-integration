import type { IdentityEventLike } from './members'

/**
 * What the other members do when Identity announces a change
 * (architecture §4). Each handler is idempotent, so redelivery is harmless;
 * events the other members need not act on are ignored. Access never depends
 * on these: Authentication reads the standing and Authorisation the
 * directory on every decision. They end sessions promptly, remove accounts,
 * and keep roles in step with ownership and membership.
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
  /** The role each membership kind holds in its group; null for none. Defaults: `member` for members, `viewer` for guests. */
  membershipRoles?: { member: string | null, guest: string | null }
}

/** The actor recorded on role changes made because of Identity's events. */
export const IDENTITY_EVENT_ACTOR = 'iam-integration'

export function createIdentityEventHandler(deps: IdentityEventHandlerDependencies) {
  const roles = deps.membershipRoles ?? { member: 'member', guest: 'viewer' }
  const actorPrincipalId = IDENTITY_EVENT_ACTOR
  const text = (value: unknown) => (typeof value === 'string' ? value : null)

  return async function handle(event: IdentityEventLike): Promise<void> {
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
      case 'identity.closed':
        if (identityId) await deps.deleteAccount(identityId)
        return
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
        const role = data.kind === 'guest' ? roles.guest : roles.member
        if (role) await deps.assignRole({ principalId: identityId, groupId, roleId: role, actorPrincipalId })
        if (data.owner === true) await deps.assignRole({ principalId: identityId, groupId, roleId: 'owner', actorPrincipalId })
        return
      }
      case 'membership.ended':
        if (identityId && groupId) await deps.unassignRole({ principalId: identityId, groupId, roleId: null, actorPrincipalId })
        return
      default:
        // Other events need nothing from Authentication or Authorisation.
    }
  }
}
