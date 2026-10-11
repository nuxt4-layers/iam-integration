import type { AuthorisationDirectoryLike, AuthorisationGroupLike, IdentityDirectoryLike, IdentityGroupDescriptionLike } from './members'

/**
 * Authorisation's directory port (contract 3), from Identity's directory
 * (architecture §3).
 *
 * The actor's kind (person, service or break-glass) passes through, so
 * Authorisation can refuse a service identity's request or decision on an
 * access change (docs/processes/service-identities.md). Each membership's
 * effective status passes through: Identity has already
 * folded in its dates and the identity's state. The identity's own state
 * becomes the principal's status, which governs the personal group: `active`
 * and `paused` as they are, anything else (`suspended`, `closure-pending`,
 * `closed`) `suspended`, which confers nothing. Consistency is passed
 * through unchanged, and failures reject.
 */
const principalStatus = (state: string): 'active' | 'paused' | 'suspended' =>
  state === 'active' || state === 'paused' ? state : 'suspended'

const group = (description: IdentityGroupDescriptionLike): AuthorisationGroupLike =>
  ({ groupId: description.groupId, lineage: [...description.lineage], tenantId: description.tenantId })

export function authorisationDirectoryFromIdentity(input: { directory: IdentityDirectoryLike }): AuthorisationDirectoryLike {
  const { directory } = input
  return {
    async resolveActor(principalId, options) {
      const actor = await directory.resolveActor(principalId, options)
      if (!actor) return null
      return {
        principalId: actor.identityId,
        kind: actor.kind,
        status: principalStatus(actor.identityState),
        personalGroup: actor.personalGroup ? group(actor.personalGroup) : null,
        memberships: actor.memberships.map(membership => ({
          group: group(membership.group),
          status: membership.effectiveStatus === 'active' || membership.effectiveStatus === 'paused' ? membership.effectiveStatus : 'suspended' as const,
        })),
      }
    },

    async describeGroup(groupId, options) {
      const description = await directory.describeGroup(groupId, options)
      return description ? group(description) : null
    },
  }
}
