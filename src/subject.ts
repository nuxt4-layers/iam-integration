import type { AuthenticatedPrincipalLike, IdentitySubjectLike } from './members'

/**
 * Identity's subject resolver, from Authentication's
 * `getAuthenticatedPrincipal(event)`. Identity's subject is a strict subset
 * of the principal, so only those fields cross. The request event passes
 * through opaquely.
 */
export function identitySubjectResolverFromAuthentication<Event>(input: {
  getAuthenticatedPrincipal: (event: Event) => Promise<AuthenticatedPrincipalLike | null>
}): { resolve(event: Event): Promise<IdentitySubjectLike | null> } {
  return {
    async resolve(event) {
      const principal = await input.getAuthenticatedPrincipal(event)
      if (!principal) return null
      return {
        principalId: principal.principalId,
        authenticatedAt: principal.authenticatedAt,
        assurance: { level: principal.assurance.level, phishingResistant: principal.assurance.phishingResistant },
      }
    },
  }
}
