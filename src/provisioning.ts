import { newCorrelationId, uuidv7 } from './identifiers'
import type { AuthenticationIdentityLike, IdentityProvisioningLike } from './members'

/**
 * Authentication's identity port, from Identity's provisioning port
 * (architecture §3; processes/provisioning.md).
 *
 * - `reserve` issues a `pending` identity, whose identifier becomes the
 *   account's. An invitation token Identity cannot use is dropped, so the
 *   sign-up falls back to the default home tenant, as Identity's own
 *   `reserve` would with an unusable token.
 * - `confirm` makes the identity `active` once the sign-in identifier is verified.
 * - `standing` is Identity's sign-in status, always a strong read.
 *
 * Every failure rejects, and Authentication fails closed.
 */
const INVITATION_TOKEN = /^[A-Za-z0-9_-]{43}$/

export function authenticationIdentityFromIdentity(input: { provisioning: IdentityProvisioningLike }): AuthenticationIdentityLike {
  const { provisioning } = input
  return {
    async reserve({ invitationToken }) {
      const token = invitationToken && INVITATION_TOKEN.test(invitationToken) ? invitationToken : undefined
      const { identityId } = await provisioning.reserve({
        requestId: uuidv7(),
        kind: 'person',
        ...(token ? { invitationToken: token } : {}),
        correlationId: newCorrelationId(),
      })
      return { principalId: identityId }
    },

    async confirm(principalId) {
      await provisioning.confirm({ identityId: principalId, correlationId: newCorrelationId() })
    },

    async standing(principalId) {
      const status = await provisioning.signInStatus(principalId)
      if (!status) return null
      return { standing: status.signIn, passkeyOnly: status.passkeyOnly }
    },
  }
}
