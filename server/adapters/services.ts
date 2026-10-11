import { newCorrelationId } from './identifiers'
import type {
  AuthenticatedPrincipalLike,
  AuthenticationEventLike,
  AuthenticationServiceGovernanceLike,
  IdentityServiceIdentitiesLike,
  IdentitySubjectLike,
} from './members'

/** Identity's subject for a principal: the fields Identity accepts, nothing more. */
const subjectOf = (principal: AuthenticatedPrincipalLike): IdentitySubjectLike => ({
  principalId: principal.principalId,
  authenticatedAt: principal.authenticatedAt,
  assurance: { level: principal.assurance.level, phishingResistant: principal.assurance.phishingResistant },
})

/**
 * Authentication's service-governance port, from Identity's service
 * identities (docs/processes/service-identities.md#credentials): whether the
 * signed-in person may issue, list or revoke a service identity's
 * credentials now. Identity answers from its own record and its access
 * decision (`identity.service-identities:manage` in the owning group). A
 * service principal never manages credentials, so it is refused without
 * asking. Any failure rejects, and Authentication refuses.
 */
export function authenticationServiceGovernanceFromIdentity(input: { services: IdentityServiceIdentitiesLike }): AuthenticationServiceGovernanceLike {
  return {
    async mayManage({ principal, serviceIdentityId }) {
      if (principal.kind === 'service') return false
      return input.services.mayManageCredentials({ subject: subjectOf(principal), identityId: serviceIdentityId, correlationId: newCorrelationId() })
    },
  }
}

/** The service-credential events the owners hear of. */
export const SERVICE_CREDENTIAL_NOTICES = [
  'authentication.service-credential-issued',
  'authentication.service-credential-revoked',
  'authentication.service-credential-expiring',
] as const

export type ServiceCredentialNoticeType = typeof SERVICE_CREDENTIAL_NOTICES[number]

/** What the host's notification capability is asked to tell a service identity's owners. Identifiers, codes and times only. */
export interface ServiceCredentialNotice {
  type: ServiceCredentialNoticeType
  serviceIdentityId: string
  owningGroupId: string
  /** The owning group's owners, as Identity records them now. */
  ownerIds: readonly string[]
  credentialId: string
  credentialKind: 'secret' | 'public-key'
  expiresAt: string
  occurredAt: string
}

/**
 * Tells a service identity's owners of each credential issued, revoked or
 * about to expire (docs/processes/service-identities.md#credentials). Handles
 * Authentication's events from its event sink: it asks Identity for the
 * owning group's owners and hands the notice to the host's `deliver`, which
 * reaches each owner by the means it has (a sign-in identifier is
 * Authentication's, used for security notices). Other events are ignored,
 * and so is an identity Identity no longer describes as a service identity.
 * Notices are best effort; access never depends on them. A failure rejects,
 * for the host to log.
 */
export function createServiceCredentialNoticeHandler(deps: {
  services: Pick<IdentityServiceIdentitiesLike, 'describe'>
  deliver(notice: ServiceCredentialNotice): Promise<void>
}) {
  const types: ReadonlySet<string> = new Set(SERVICE_CREDENTIAL_NOTICES)
  return async function handle(event: AuthenticationEventLike): Promise<void> {
    if (!types.has(event.type) || !event.principalId || !event.credential) return
    const service = await deps.services.describe({ identityId: event.principalId, correlationId: newCorrelationId() })
    if (!service) return
    await deps.deliver({
      type: event.type as ServiceCredentialNoticeType,
      serviceIdentityId: service.identityId,
      owningGroupId: service.owningGroupId,
      ownerIds: [...service.ownerIds],
      credentialId: event.credential.credentialId,
      credentialKind: event.credential.kind,
      expiresAt: event.credential.expiresAt,
      occurredAt: event.occurredAt,
    })
  }
}
