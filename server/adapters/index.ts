/**
 * `@nuxt4-layers/iam-integration`: reference adapters between the IAM suite's
 * members (docs/architecture.md §3, §4). A host passes in the members' server
 * functions and supplies the adapters to the members' ports. Nothing here
 * imports a member, stores data, or decides anything a member owns.
 */
export type * from './members'
export { groupResource, identityAccessDecisionFromAuthorisation, identityApprovalPolicyFromAuthorisation } from './access'
export { authorisationDirectoryFromIdentity } from './directory'
export { createIdentityEventHandler, createProfileEventHandler, IDENTITY_EVENT_ACTOR } from './events'
export type { IdentityEventHandlerDependencies } from './events'
export { newCorrelationId, uuidv7 } from './identifiers'
export { authenticationIdentityFromIdentity } from './provisioning'
export { createAuthenticationEventHandler, reconcileCredentialRecoveries } from './recovery'
export { profileAccessDecisionFromAuthorisation, profileRequestCoordinatorFromMembers } from './requests'
export type { RecoveryDependencies } from './recovery'
export { rolesWithIdentityPermissions } from './roles'
export { identitySubjectResolverFromAuthentication } from './subject'
