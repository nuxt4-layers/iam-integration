import { groupResource } from './access'
import type {
  AuthorisationDecisionLike,
  AuthorisationResourceLike,
  IdentitySubjectLike,
  IdentityExportLike,
  PrincipalExportLike,
  ProfileAccessDecisionLike,
  ProfileRequestCoordinatorLike,
  ProfileRequestMember,
} from './members'

/**
 * Profile's coordination port for data-subject requests
 * (docs/processes/data-subject-requests.md), from the members' server-only
 * export functions.
 *
 * Each member answers for what it holds; a member the host does not compose
 * holds nothing (null). Profile asks for one part at a time, so a member
 * that fails rejects only its own part, which Profile keeps pending and
 * retries; a failure is never taken for an empty answer. Bundles pass
 * through unchanged, to Profile only.
 */
export function profileRequestCoordinatorFromMembers(input: {
  /** Identity's `exportIdentityData`. */
  exportIdentity?: IdentityExportLike
  /** Authentication's `exportAuthenticationData`. */
  exportAuthentication?: PrincipalExportLike
  /** Authorisation's `exportAuthorisationData`. */
  exportAuthorisation?: PrincipalExportLike
}): ProfileRequestCoordinatorLike {
  const principal = (exporter: PrincipalExportLike | undefined) => exporter
    && ((request: { identityId: string, correlationId: string }) => exporter({ principalId: request.identityId, correlationId: request.correlationId }))
  const exporters: Record<ProfileRequestMember, IdentityExportLike | undefined> = {
    identity: input.exportIdentity,
    authentication: principal(input.exportAuthentication),
    authorisation: principal(input.exportAuthorisation),
  }
  return {
    async exportPart({ identityId, part, correlationId }) {
      if (!Object.hasOwn(exporters, part)) throw new Error('Unknown request part')
      const exporter = exporters[part]
      if (!exporter) return null
      return (await exporter({ identityId, correlationId })) ?? null
    },
  }
}

/**
 * Profile's access-decision port, from Authorisation's `authorise`: whether
 * the viewer holds one of Profile's permissions on a group, now. Profile's
 * permissions act on a group, as Identity's do. Any refusal, including one
 * for insufficient assurance, is `false`: Profile then shows what it shows
 * anyone, and never says why. A failure rejects, and Profile fails closed.
 */
export function profileAccessDecisionFromAuthorisation(input: {
  authorise: (input: { subject: IdentitySubjectLike, permission: string, resource: AuthorisationResourceLike, requestTenantId?: string | null }) => Promise<AuthorisationDecisionLike>
}): ProfileAccessDecisionLike {
  return {
    async allows({ subject, permission, groupId }) {
      const decision = await input.authorise({ subject, permission, resource: groupResource(permission, groupId), requestTenantId: null })
      return decision.allowed
    },
  }
}
