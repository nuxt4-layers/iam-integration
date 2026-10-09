import type { AuthorisationDecisionLike, AuthorisationResourceLike, IdentityAccessDecisionLike, IdentitySubjectLike, RiskLevel } from './members'

/**
 * Identity's access-decision and approval-policy ports, from Authorisation
 * (architecture §3).
 *
 * Identity's permissions act on a group: the resource is the group itself,
 * of the permission's resource type, owned by that group. Authorisation's
 * detailed reasons collapse to Identity's: `insufficient-assurance` with its
 * requirement, otherwise `not-permitted`, so nothing reveals why.
 */
export function groupResource(permission: string, groupId: string): AuthorisationResourceLike {
  return { type: permission.slice(0, permission.indexOf(':')), id: groupId, owningGroupId: groupId }
}

export function identityAccessDecisionFromAuthorisation(input: {
  authorise: (input: { subject: IdentitySubjectLike, permission: string, resource: AuthorisationResourceLike, requestTenantId?: string | null }) => Promise<AuthorisationDecisionLike>
}): { decide(input: { subject: IdentitySubjectLike, permission: string, groupId: string, correlationId: string }): Promise<IdentityAccessDecisionLike> } {
  return {
    async decide({ subject, permission, groupId }) {
      const decision = await input.authorise({ subject, permission, resource: groupResource(permission, groupId), requestTenantId: null })
      if (decision.allowed) return { allowed: true }
      if (decision.reason === 'insufficient-assurance' && decision.requirement) {
        return { allowed: false, reason: 'insufficient-assurance', requirement: decision.requirement }
      }
      return { allowed: false, reason: 'not-permitted' }
    },
  }
}

export function identityApprovalPolicyFromAuthorisation(input: {
  /** The risk of a permission in the catalogue the host supplied to Authorisation, or null if missing. */
  riskOf: (permission: string) => RiskLevel | null | Promise<RiskLevel | null>
  qualifies: (input: { principalId: string, permission: string, resource: AuthorisationResourceLike }) => Promise<boolean>
  countQualifying: (input: { permission: string, resource: AuthorisationResourceLike, excludingPrincipalIds: readonly string[], limit: number }) => Promise<number>
}): {
  riskOf(permission: string): Promise<RiskLevel | null>
  qualifies(input: { approverId: string, permission: string, groupId: string }): Promise<boolean>
  countQualifying(input: { permission: string, groupId: string, excludingId: string, limit: number }): Promise<number>
} {
  return {
    async riskOf(permission) {
      return await input.riskOf(permission)
    },
    qualifies({ approverId, permission, groupId }) {
      return input.qualifies({ principalId: approverId, permission, resource: groupResource(permission, groupId) })
    },
    countQualifying({ permission, groupId, excludingId, limit }) {
      return input.countQualifying({ permission, resource: groupResource(permission, groupId), excludingPrincipalIds: [excludingId], limit })
    },
  }
}
