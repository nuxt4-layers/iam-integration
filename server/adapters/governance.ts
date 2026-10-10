import type { AuthorisationGovernanceLike, IdentityAccessGovernanceLike } from './members'

/**
 * Authorisation's governance port (docs/processes/access-administration.md),
 * from Identity's access governance: the group's approval requirement and
 * safety periods in force, its parent and root, whose personal group it is,
 * the requester's recovery hold and the identities they control, and
 * Identity's own record of owners. The identity identifier becomes the
 * principal identifier; nothing else changes. A failure rejects, and
 * Authorisation refuses the change.
 */
export function authorisationGovernanceFromIdentity(input: {
  /** Identity's `getIdentityAccessGovernance()`. */
  governance: IdentityAccessGovernanceLike
}): AuthorisationGovernanceLike {
  const { governance } = input
  return {
    async describeGroup({ groupId, principalId, correlationId }) {
      const group = await governance.describeGroup({ groupId, identityId: principalId, correlationId })
      if (!group) return null
      const { personalOfIdentityId, ...rest } = group
      return { ...rest, personalOfPrincipalId: personalOfIdentityId }
    },
    isOwner: ({ principalId, groupId }) => governance.isOwner({ identityId: principalId, groupId }),
    countOwners: ({ groupId, excluding }) => governance.countOwners({ groupId, excluding }),
  }
}
