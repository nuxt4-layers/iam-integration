/**
 * The members' public shapes, as the adapters see them.
 *
 * iam-integration imports no member package at runtime: a host passes in the
 * members' server functions, and these structural types name what each
 * adapter needs. They mirror the members' contracts (Identity contract 1,
 * Authentication contract 1, Authorisation contract 2); a host's type check
 * proves the real functions fit them. Members never import one another, and
 * nothing here re-implements a member's rule.
 */

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

export type IdentitySignInOutcome = 'allowed' | 'resume-only' | 'cancel-closure-only' | 'verification-only' | 'refused'

/** Identity's provisioning port (`getIdentityProvisioning()`). */
export interface IdentityProvisioningLike {
  reserve(input: { requestId: string, kind: 'person', invitationToken?: string, correlationId: string }): Promise<{ identityId: string }>
  confirm(input: { identityId: string, correlationId: string }): Promise<unknown>
  signInStatus(identityId: string): Promise<{ signIn: IdentitySignInOutcome, passkeyOnly: boolean } | null>
}

export interface IdentityGroupDescriptionLike {
  groupId: string
  tenantId: string
  lineage: readonly string[]
}

/** Identity's directory (`getIdentityDirectory()`). */
export interface IdentityDirectoryLike {
  resolveActor(identityId: string, options: { consistency: 'strong' | 'bounded' }): Promise<{
    identityId: string
    /** The identity's own state (never `pending`: the directory answers null for those). */
    identityState: 'active' | 'paused' | 'suspended' | 'closure-pending' | 'closed'
    personalGroup: IdentityGroupDescriptionLike | null
    memberships: readonly { group: IdentityGroupDescriptionLike, effectiveStatus: 'active' | 'paused' | 'suspended' }[]
  } | null>
  describeGroup(groupId: string, options: { consistency: 'strong' | 'bounded' }): Promise<IdentityGroupDescriptionLike | null>
}

export interface IdentitySubjectLike {
  principalId: string
  authenticatedAt: string
  assurance: { level: 'aal1' | 'aal2', phishingResistant: boolean }
}

export interface IdentityStepUpRequirementLike {
  minimumLevel: 'aal1' | 'aal2'
  phishingResistant: boolean
  maxAuthenticationAgeSeconds: number | null
}

export type IdentityAccessDecisionLike =
  | { allowed: true }
  | { allowed: false, reason: 'not-permitted' }
  | { allowed: false, reason: 'insufficient-assurance', requirement: IdentityStepUpRequirementLike }

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical'

/** An event from Identity's outbox, as its relay publishes it. */
export interface IdentityEventLike {
  eventId: string
  type: string
  correlationId: string
  data: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

/** Authentication's `AuthenticatedPrincipal`, the fields Identity needs. */
export interface AuthenticatedPrincipalLike {
  principalId: string
  authenticatedAt: string
  assurance: { level: 'aal1' | 'aal2', phishingResistant: boolean }
}

export type AuthenticationStanding = IdentitySignInOutcome

/** Authentication's optional identity port (`provideAuthenticationIdentity`). */
export interface AuthenticationIdentityLike {
  reserve(input: { invitationToken: string | null }): Promise<{ principalId: string }>
  confirm(principalId: string): Promise<void>
  standing(principalId: string): Promise<{ standing: AuthenticationStanding, passkeyOnly: boolean } | null>
}

export interface AuthenticationEventLike {
  type: string
  occurredAt: string
  principalId: string | null
}

export interface AuthenticationCredentialRecoveryLike {
  principalId: string
  recoveredAt: string
}

// ---------------------------------------------------------------------------
// Authorisation
// ---------------------------------------------------------------------------

export interface AuthorisationResourceLike {
  type: string
  id: string
  owningGroupId: string
}

export type AuthorisationDecisionLike =
  | { allowed: true }
  | { allowed: false, reason: string, requirement: IdentityStepUpRequirementLike | null }

export interface AuthorisationGroupLike {
  groupId: string
  lineage: readonly string[]
  tenantId: string
}

/** Authorisation's directory port (contract 3). */
export interface AuthorisationDirectoryLike {
  resolveActor(principalId: string, options: { consistency: 'strong' | 'bounded' }): Promise<{
    principalId: string
    status: 'active' | 'paused' | 'suspended'
    personalGroup: AuthorisationGroupLike | null
    memberships: { group: AuthorisationGroupLike, status: 'active' | 'paused' | 'suspended' | 'ended' }[]
  } | null>
  describeGroup(groupId: string, options: { consistency: 'strong' | 'bounded' }): Promise<AuthorisationGroupLike | null>
}
