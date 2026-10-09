import type { AuthorisationDirectoryLike, AuthorisationGroupLike, IdentityDirectoryLike, IdentityGroupDescriptionLike } from './members'

/**
 * Authorisation's directory port, from Identity's directory (architecture §3).
 *
 * Identity speaks its own vocabulary; Authorisation contract 2 has no
 * `paused` status, so a paused membership is passed on as `suspended`: it
 * confers nothing until Authorisation contract 3 lets paused members view.
 * Consistency is passed through unchanged, and failures reject.
 */
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
        personalGroup: actor.personalGroup ? group(actor.personalGroup) : null,
        memberships: actor.memberships.map(membership => ({
          group: group(membership.group),
          status: membership.effectiveStatus === 'active' ? 'active' as const : 'suspended' as const,
        })),
      }
    },

    async describeGroup(groupId, options) {
      const description = await directory.describeGroup(groupId, options)
      return description ? group(description) : null
    },
  }
}
