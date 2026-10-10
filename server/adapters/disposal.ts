import type {
  AuthorisationTenantExportLike,
  DisposalSubjectLike,
  IdentityDisposalRecorderLike,
  IdentityLegalHoldCoversLike,
  IdentitySubjectLike,
  IdentityTenantExportLike,
  MemberEventLike,
  ProfileHeldPart,
  ProfileLegalHoldPartsLike,
} from './members'

/** A member's name, as the prefix of its events: `authorisation`, `profile`, or a domain capability's. */
const MEMBER_NAME = /^[a-z][a-z0-9-]{0,62}$/

/**
 * Relays members' disposal confirmations to Identity
 * (docs/processes/group-deletion.md step 6). Every member that disposes of a
 * group or tenant writes `<member>.group-disposed` (with `groupId`) or
 * `<member>.tenant-disposed` (with `tenantId`) from its own outbox; the member
 * is the event's prefix. Identity decides whether it expected that member.
 * Other events are ignored. Identity is idempotent by event identifier, and
 * a failure rejects so that the relay delivers the event again.
 */
export function createDisposalConfirmationHandler(deps: { record: IdentityDisposalRecorderLike }) {
  return async function handle(event: MemberEventLike): Promise<void> {
    const match = /^([^.]+)\.(group|tenant)-disposed$/.exec(event.type)
    if (!match || !MEMBER_NAME.test(match[1]!) || match[1] === 'identity') return
    const kind = match[2] as DisposalSubjectLike['kind']
    const id = kind === 'group' ? event.data.groupId : event.data.tenantId
    if (typeof id !== 'string' || id === '') return
    await deps.record({ subject: { kind, id }, member: match[1]!, eventId: event.eventId, correlationId: event.correlationId })
  }
}

/** A legal hold's subject, as a member's retention or disposal asks about it. */
export type LegalHoldSubject = DisposalSubjectLike | { kind: 'person', id: string }

/** The legal-hold port a member's maintenance reads before deleting (docs/processes/retention.md). */
export interface LegalHolds {
  covers(subject: LegalHoldSubject): Promise<boolean>
}

/**
 * One member's legal-hold port, from where the holds are kept
 * (architecture §8): Identity's on groups and tenants, Profile's on people.
 * `part` is the asking member's part of a person's data. Without Profile
 * there are no holds on people. A failure rejects, and the member keeps the
 * record for its next run.
 */
export function legalHoldsFromMembers(input: {
  part: ProfileHeldPart
  /** Identity's `identityLegalHoldCovers`. */
  groupOrTenantHeld: IdentityLegalHoldCoversLike
  /** Profile's `profileLegalHoldParts`, when the host composes Profile. */
  personHeldParts?: ProfileLegalHoldPartsLike
}): LegalHolds {
  return {
    async covers(subject) {
      if (subject.kind === 'person') {
        if (!input.personHeldParts) return false
        return (await input.personHeldParts(subject.id)).includes(input.part)
      }
      if (subject.kind !== 'group' && subject.kind !== 'tenant') throw new Error('Unknown legal-hold subject')
      return input.groupOrTenantHeld({ kind: subject.kind, id: subject.id })
    },
  }
}

/** A tenant's governance export: each member's part, unchanged. */
export interface TenantExport {
  identity: { groups: readonly { groupId: string }[] }
  authorisation: unknown | null
}

/**
 * The tenant's governance export (docs/processes/tenant-lifecycle.md), for
 * the host's endpoint. Identity decides who may have it: its part is asked
 * for first, and Authorisation's only once Identity has given its own. Any
 * failure rejects the whole export, so that no partial export is taken for
 * a complete one. Nothing is stored; the host returns it to the requester.
 */
export function tenantExportFromMembers(input: {
  exportIdentityTenant: IdentityTenantExportLike
  exportAuthorisationTenant?: AuthorisationTenantExportLike
}) {
  return {
    async exportTenant(request: { subject: IdentitySubjectLike, tenantId: string, correlationId: string }): Promise<TenantExport | null> {
      const identity = await input.exportIdentityTenant(request)
      if (identity === null || identity === undefined) return null
      const authorisation = input.exportAuthorisationTenant
        ? (await input.exportAuthorisationTenant({ tenantId: request.tenantId, groupIds: identity.groups.map(group => group.groupId), correlationId: request.correlationId })) ?? null
        : null
      return { identity, authorisation }
    },
  }
}
