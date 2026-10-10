import type { IdentityJoiningLike, IdentitySubjectLike } from './members'

/** What the host's notification capability receives for one invitation. Never stored or logged by this adapter. */
export interface InvitationMessage {
  /** The address to send to, as the inviter typed it. */
  address: string
  /** Identity's acceptance page with the token in the fragment, which browsers never send to a server. */
  link: string
  groupId: string
  kind: 'member' | 'guest'
  expiresAt: string
  correlationId: string
}

/** The host's delivery of invitation messages (email or another channel). Rejects if it cannot take the message. */
export type InvitationDeliver = (message: InvitationMessage) => Promise<void>

export interface InvitationSender {
  /**
   * Creates an invitation in Identity and hands its link to delivery. The
   * answer depends only on the inviter and the group, never on the address:
   * the address is not looked up anywhere, and the invitation is bound to no
   * identity, so whoever signs in with the link accepts it (and is
   * provisioned first if new).
   */
  send(input: {
    subject: IdentitySubjectLike
    groupId: string
    kind: 'member' | 'guest'
    address: string
    membershipStartsAt?: string | null
    membershipEndsAt?: string | null
    correlationId: string
  }): Promise<{ invitationId: string, expiresAt: string, requiresConfirmation: boolean }>
}

/** An address the delivery may be asked to use: printable, without spaces, at most 320 characters (RFC 5321). Its validity is delivery's to judge. */
const ADDRESS = /^[^\s\p{Cc}\p{Cf}]{3,320}$/u

export class InvitationAddressError extends Error {
  readonly code = 'validation-failed'
  constructor() {
    super('Invitation address is not usable')
  }
}

/**
 * Invitation delivery (docs/processes/joining-and-leaving.md): the host's
 * invitation endpoint asks Identity for an invitation, receives the token
 * once, and passes the link and the address to the host's notification
 * capability. Identity never receives the address; this adapter keeps
 * neither. If delivery refuses the message, the invitation is revoked, so
 * no token is left that nobody holds, and the call rejects.
 */
export function invitationSenderFromIdentity(input: {
  /** Identity's `getIdentityJoining()`. */
  joining: IdentityJoiningLike
  deliver: InvitationDeliver
  /** The absolute URL of Identity's invitation page (`identity.pages.paths.invitation`), e.g. `https://example.org/invitations/accept`. */
  acceptanceUrl: string
}): InvitationSender {
  const acceptance = new URL(input.acceptanceUrl)
  if (acceptance.protocol !== 'https:' && acceptance.hostname !== 'localhost') throw new TypeError('acceptanceUrl must be an https URL.')
  if (acceptance.hash || acceptance.search) throw new TypeError('acceptanceUrl must have no query or fragment.')
  return {
    async send({ subject, groupId, kind, address, membershipStartsAt, membershipEndsAt, correlationId }) {
      if (typeof address !== 'string' || !ADDRESS.test(address)) throw new InvitationAddressError()
      const invitation = await input.joining.invite({ subject, groupId, kind, inviteeIdentityId: null, membershipStartsAt, membershipEndsAt, correlationId })
      try {
        await input.deliver({ address, link: `${acceptance.href}#${invitation.token}`, groupId, kind, expiresAt: invitation.expiresAt, correlationId })
      }
      catch (error) {
        await input.joining.revoke({ subject, invitationId: invitation.invitationId, correlationId }).catch(() => {})
        throw error
      }
      return { invitationId: invitation.invitationId, expiresAt: invitation.expiresAt, requiresConfirmation: invitation.requiresConfirmation }
    },
  }
}
