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
  occurredAt: string
  correlationId: string
  data: Record<string, unknown>
}

/** The invitation Identity's `getIdentityJoining().invite` creates: its token is returned once. */
export interface IdentityInvitationLike {
  invitationId: string
  token: string
  expiresAt: string
  requiresConfirmation: boolean
}

/** Identity's joining (`getIdentityJoining()`): what invitation delivery needs of it. */
export interface IdentityJoiningLike {
  invite(input: {
    subject: IdentitySubjectLike
    groupId: string
    kind: 'member' | 'guest'
    inviteeIdentityId?: string | null
    membershipStartsAt?: string | null
    membershipEndsAt?: string | null
    correlationId: string
  }): Promise<IdentityInvitationLike>
  revoke(input: { subject: IdentitySubjectLike, invitationId: string, correlationId: string }): Promise<unknown>
}

export type RequiredApproversLike = { low: 0 | 1, medium: 0 | 1, high: 1 | 2, critical: 1 | 2 }

export interface SafetyPeriodsInForceLike {
  publishedDelayHighHours: number
  publishedDelayCriticalHours: number
  approvalExpiryDays: number
  recoveryHoldHours: number
}

/** A group as Identity's access governance describes it to Authorisation, for one requester. */
export interface IdentityGovernedGroupLike {
  groupId: string
  tenantId: string
  kind: 'standard' | 'personal'
  state: 'active' | 'orphaned' | 'archived'
  parentGroupId: string | null
  rootGroupId: string
  /** For a personal group: whose it is. */
  personalOfIdentityId: string | null
  approvals: { required: RequiredApproversLike, referenceRequired: boolean }
  safetyPeriods: SafetyPeriodsInForceLike
  requester: {
    /** The end of the requester's recovery hold, if one is running. */
    recoveryHoldUntil: string | null
    /** Identities the requester controls (service identities they created), which never approve for them. */
    controls: readonly string[]
  }
}

/** Identity's access governance (`getIdentityAccessGovernance()`), from its own record, at `strong` consistency. */
export interface IdentityAccessGovernanceLike {
  describeGroup(input: { groupId: string, identityId: string, correlationId: string }): Promise<IdentityGovernedGroupLike | null>
  isOwner(input: { identityId: string, groupId: string }): Promise<boolean>
  countOwners(input: { groupId: string, excluding: readonly string[] }): Promise<number>
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

/** Identity's `exportIdentityData`: its part of an access request, or null when unknown. */
export type IdentityExportLike = (input: { identityId: string, correlationId: string }) => Promise<unknown | null>

/** Authentication's `exportAuthenticationData` and Authorisation's `exportAuthorisationData`: null when they hold nothing. */
export type PrincipalExportLike = (input: { principalId: string, correlationId: string }) => Promise<unknown | null>

/** Authorisation's governance port (`provideAuthorisationGovernance`): Identity's facts in Authorisation's vocabulary. */
export interface AuthorisationGovernanceLike {
  describeGroup(input: { groupId: string, principalId: string, correlationId: string }): Promise<(Omit<IdentityGovernedGroupLike, 'personalOfIdentityId'> & { personalOfPrincipalId: string | null }) | null>
  isOwner(input: { principalId: string, groupId: string }): Promise<boolean>
  countOwners(input: { groupId: string, excluding: readonly string[] }): Promise<number>
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/** The members whose parts of a data-subject request Profile coordinates, besides its own. */
export type ProfileRequestMember = 'identity' | 'authentication' | 'authorisation'

/** The parts a legal hold can cover (Profile contract §14). */
export type ProfileHeldPart = 'profile' | 'authentication' | 'authorisation'

/**
 * Profile's coordination port (`ProfileRequestCoordinator`): one member's
 * part of an access request, or null when that member holds nothing for the
 * identity. A member's failure rejects, and Profile keeps the part pending.
 */
export interface ProfileRequestCoordinatorLike {
  exportPart(input: { identityId: string, part: ProfileRequestMember, correlationId: string }): Promise<unknown | null>
}

/** Profile's access-decision port (`ProfileAccessDecision`). */
export interface ProfileAccessDecisionLike {
  allows(input: { subject: IdentitySubjectLike, permission: string, groupId: string }): Promise<boolean>
}

/** An event from Profile's outbox, as its relay publishes it. */
export interface ProfileEventLike {
  eventId: string
  type: string
  occurredAt: string
  correlationId: string
  data: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// End of life: disposal, holds and the tenant export
// ---------------------------------------------------------------------------

/** What a group or tenant disposal is about. */
export interface DisposalSubjectLike {
  kind: 'group' | 'tenant'
  id: string
}

/** An event from any member's outbox, as its relay publishes it. */
export interface MemberEventLike {
  eventId: string
  type: string
  occurredAt: string
  correlationId: string
  data: Record<string, unknown>
}

/**
 * Identity's `recordIdentityDisposal`: one member's part of a group's or
 * tenant's disposal is done. Identity checks the member is one it expects
 * and keeps the confirmation; it is idempotent by event identifier.
 */
export type IdentityDisposalRecorderLike = (input: { subject: DisposalSubjectLike, member: string, eventId: string, correlationId: string }) => Promise<unknown>

/**
 * Identity's `identityLegalHoldCovers`: whether a legal hold covers a group
 * (directly or through its tenant) or a tenant now.
 */
export type IdentityLegalHoldCoversLike = (subject: DisposalSubjectLike) => Promise<boolean>

/** Profile's `profileLegalHoldParts`: the parts of a person's data under legal hold now. */
export type ProfileLegalHoldPartsLike = (identityId: string) => Promise<readonly ProfileHeldPart[]>

/**
 * Identity's `exportIdentityTenantData`: the tenant's governance records, for
 * an owner of its root group during the notice period. Identity decides who
 * may have it, and rejects with its coarse error otherwise; null when the
 * tenant is unknown.
 */
export type IdentityTenantExportLike = (input: { subject: IdentitySubjectLike, tenantId: string, correlationId: string }) => Promise<unknown | null>

/** Authorisation's `exportAuthorisationTenantData`: server-only, its part of the tenant's governance export. */
export type AuthorisationTenantExportLike = (input: { tenantId: string, correlationId: string }) => Promise<unknown | null>
