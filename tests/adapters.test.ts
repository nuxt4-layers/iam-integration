import { describe, expect, it } from 'vitest'
import {
  authenticationIdentityFromIdentity,
  authorisationDirectoryFromIdentity,
  authorisationGovernanceFromIdentity,
  authenticationServiceGovernanceFromIdentity,
  createAuthenticationEventHandler,
  createDisposalConfirmationHandler,
  createIdentityEventHandler,
  createProfileEventHandler,
  createServiceCredentialNoticeHandler,
  identityAccessDecisionFromAuthorisation,
  identityApprovalPolicyFromAuthorisation,
  identitySubjectResolverFromAuthentication,
  InvitationAddressError,
  invitationSenderFromIdentity,
  legalHoldsFromMembers,
  profileAccessDecisionFromAuthorisation,
  profileRequestCoordinatorFromMembers,
  reconcileCredentialRecoveries,
  rolesWithIdentityPermissions,
  tenantExportFromMembers,
  uuidv7,
} from '../server/adapters'
import type { IdentityJoiningLike, IdentityProvisioningLike, IdentityServiceIdentitiesLike, InvitationMessage, ServiceCredentialNotice } from '../server/adapters'

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('identifiers', () => {
  it('issues UUIDv7s in time order', () => {
    const a = uuidv7(1_000)
    const b = uuidv7(2_000)
    expect(a).toMatch(UUID_V7)
    expect(a < b).toBe(true)
  })
})

describe('Authentication identity port from Identity provisioning', () => {
  const calls: unknown[] = []
  const provisioning: IdentityProvisioningLike = {
    async reserve(input) {
      calls.push(['reserve', input])
      return { identityId: '01a00000-0000-7000-8000-000000000001' }
    },
    async confirm(input) {
      calls.push(['confirm', input])
    },
    async signInStatus(identityId) {
      if (identityId === 'unknown') return null
      return { signIn: 'resume-only', passkeyOnly: identityId === 'break-glass' }
    },
  }
  const port = authenticationIdentityFromIdentity({ provisioning })

  it('reserves with a fresh request identifier and no personal data, passing only a usable invitation token', async () => {
    const token = 'A'.repeat(43)
    expect(await port.reserve({ invitationToken: token })).toEqual({ principalId: '01a00000-0000-7000-8000-000000000001' })
    expect(await port.reserve({ invitationToken: 'not-a-token' })).toEqual({ principalId: '01a00000-0000-7000-8000-000000000001' })
    const [first, second] = calls.filter(call => (call as unknown[])[0] === 'reserve').map(call => (call as [string, Record<string, string>])[1])
    expect(first).toMatchObject({ kind: 'person', invitationToken: token })
    expect(first!.requestId).toMatch(UUID_V7)
    expect(first!.correlationId).toMatch(UUID)
    expect(second).not.toHaveProperty('invitationToken')
    expect(Object.keys(first!).sort()).toEqual(['correlationId', 'invitationToken', 'kind', 'requestId'])
  })

  it('confirms by identity, and passes the standing through', async () => {
    await port.confirm('01a00000-0000-7000-8000-000000000001')
    expect(calls.at(-1)).toMatchObject(['confirm', { identityId: '01a00000-0000-7000-8000-000000000001' }])
    expect(await port.standing('someone')).toEqual({ standing: 'resume-only', passkeyOnly: false })
    expect(await port.standing('break-glass')).toEqual({ standing: 'resume-only', passkeyOnly: true })
    expect(await port.standing('unknown')).toBeNull()
  })

  it('rejects when Identity fails, so Authentication fails closed', async () => {
    const failing = authenticationIdentityFromIdentity({ provisioning: { ...provisioning, signInStatus: async () => { throw new Error('down') } } })
    await expect(failing.standing('someone')).rejects.toThrow('down')
  })
})

describe('Identity subject resolver from Authentication', () => {
  it('passes only the fields Identity accepts', async () => {
    const resolver = identitySubjectResolverFromAuthentication<string>({
      async getAuthenticatedPrincipal(event) {
        if (event !== 'signed-in') return null
        return { principalId: 'p', sessionId: 's', expiresAt: 'x', authenticatedAt: '2026-10-09T20:00:00.000Z', assurance: { level: 'aal2', methods: ['passkey'], phishingResistant: true }, standing: 'allowed' } as never
      },
    })
    expect(await resolver.resolve('signed-in')).toEqual({ principalId: 'p', authenticatedAt: '2026-10-09T20:00:00.000Z', assurance: { level: 'aal2', phishingResistant: true } })
    expect(await resolver.resolve('anonymous')).toBeNull()
  })
})

describe('Authorisation directory from Identity', () => {
  const sales = { groupId: 'sales', tenantId: 't', lineage: ['company', 'sales'], kind: 'standard', state: 'active' }
  let identityState = 'active'
  const directory = authorisationDirectoryFromIdentity({
    directory: {
      async resolveActor(identityId, options) {
        expect(options.consistency).toBe('strong')
        return {
          identityId,
          kind: 'person',
          identityState,
          personalGroup: { groupId: 'personal', tenantId: 't', lineage: ['personal'] },
          memberships: [
            { group: sales, effectiveStatus: 'active' },
            { group: { ...sales, groupId: 'paused-group', lineage: ['paused-group'] }, effectiveStatus: 'paused' },
            { group: { ...sales, groupId: 'suspended-group', lineage: ['suspended-group'] }, effectiveStatus: 'suspended' },
          ],
        } as never
      },
      async describeGroup(groupId) {
        return groupId === 'sales' ? sales : null
      },
    },
  })

  it('speaks Authorisation contract 3: a paused membership passes through as paused', async () => {
    identityState = 'active'
    const actor = await directory.resolveActor('p', { consistency: 'strong' })
    expect(actor).toEqual({
      principalId: 'p',
      kind: 'person',
      status: 'active',
      personalGroup: { groupId: 'personal', lineage: ['personal'], tenantId: 't' },
      memberships: [
        { group: { groupId: 'sales', lineage: ['company', 'sales'], tenantId: 't' }, status: 'active' },
        { group: { groupId: 'paused-group', lineage: ['paused-group'], tenantId: 't' }, status: 'paused' },
        { group: { groupId: 'suspended-group', lineage: ['suspended-group'], tenantId: 't' }, status: 'suspended' },
      ],
    })
    expect(await directory.describeGroup('sales', { consistency: 'strong' })).toEqual({ groupId: 'sales', lineage: ['company', 'sales'], tenantId: 't' })
    expect(await directory.describeGroup('other', { consistency: 'strong' })).toBeNull()
  })

  it.each([
    ['active', 'active'],
    ['paused', 'paused'],
    ['suspended', 'suspended'],
    ['closure-pending', 'suspended'],
    ['closed', 'suspended'],
  ])('reports an identity that is %s as a principal that is %s', async (state, status) => {
    identityState = state
    expect((await directory.resolveActor('p', { consistency: 'strong' }))?.status).toBe(status)
  })
})

describe('Identity access decision and approval policy from Authorisation', () => {
  const subject = { principalId: 'p', authenticatedAt: '2026-10-09T20:00:00.000Z', assurance: { level: 'aal1' as const, phishingResistant: false } }
  const requirement = { minimumLevel: 'aal2' as const, phishingResistant: true, maxAuthenticationAgeSeconds: 900 }

  it('asks about the group itself and collapses reasons', async () => {
    const asked: unknown[] = []
    const answers = [
      { allowed: true as const },
      { allowed: false as const, reason: 'insufficient-assurance', requirement },
      { allowed: false as const, reason: 'tenant-mismatch', requirement: null },
    ]
    const access = identityAccessDecisionFromAuthorisation({
      async authorise(input) {
        asked.push(input)
        return answers.shift()!
      },
    })
    const input = { subject, permission: 'identity.groups:archive', groupId: 'g', correlationId: 'c' }
    expect(await access.decide(input)).toEqual({ allowed: true })
    expect(asked[0]).toEqual({ subject, permission: 'identity.groups:archive', resource: { type: 'identity.groups', id: 'g', owningGroupId: 'g' }, requestTenantId: null })
    expect(await access.decide(input)).toEqual({ allowed: false, reason: 'insufficient-assurance', requirement })
    expect(await access.decide(input)).toEqual({ allowed: false, reason: 'not-permitted' })
  })

  it('qualifies and counts on the group, excluding the requester', async () => {
    const policy = identityApprovalPolicyFromAuthorisation({
      riskOf: permission => (permission === 'identity.groups:archive' ? 'high' : null),
      async qualifies(input) {
        return input.principalId === 'approver' && input.resource.owningGroupId === 'g'
      },
      async countQualifying(input) {
        expect(input.excludingPrincipalIds).toEqual(['requester'])
        expect(input.resource).toEqual({ type: 'identity.group-owners', id: 'g', owningGroupId: 'g' })
        return Math.min(3, input.limit)
      },
    })
    expect(await policy.riskOf('identity.groups:archive')).toBe('high')
    expect(await policy.riskOf('identity.unknown:thing')).toBeNull()
    expect(await policy.qualifies({ approverId: 'approver', permission: 'identity.groups:archive', groupId: 'g' })).toBe(true)
    expect(await policy.countQualifying({ permission: 'identity.group-owners:manage', groupId: 'g', excludingId: 'requester', limit: 2 })).toBe(2)
  })
})

describe('roles for Identity\'s permissions', () => {
  it('names high and critical permissions in owner, and the running of a group in administrator', () => {
    const roles = rolesWithIdentityPermissions({
      permissions: [
        { name: 'identity.groups:view', risk: 'low' },
        { name: 'identity.groups:archive', risk: 'high' },
        { name: 'identity.group-owners:manage', risk: 'critical' },
        { name: 'identity.identities:suspend', risk: 'high' },
        { name: 'identity.tenants:export', risk: 'high' },
      ],
      roles: { owner: [{ pattern: '*' }, { pattern: 'identity.groups:archive' }], administrator: [{ pattern: '*' }] },
    })
    expect(roles.owner.map(r => r.pattern)).toEqual(['*', 'identity.groups:archive', 'identity.group-owners:manage', 'identity.identities:suspend', 'identity.tenants:export'])
    expect(roles.administrator.map(r => r.pattern)).toEqual(['*', 'identity.groups:archive'])
  })
})

describe('Identity events', () => {
  const log: string[] = []
  const handle = createIdentityEventHandler({
    async revokeSessions(id) { log.push(`revoke ${id}`) },
    async discardAccount(id) { log.push(`discard ${id}`) },
    async deleteAccount(id) { log.push(`delete ${id}`) },
    async assignRole(input) { log.push(`assign ${input.roleId} ${input.principalId}@${input.groupId} by ${input.actorPrincipalId}`) },
    async unassignRole(input) { log.push(`unassign ${input.roleId ?? 'all'} ${input.principalId}@${input.groupId}`) },
  })
  const event = (type: string, data: Record<string, unknown>) => ({ eventId: 'e', type, occurredAt: '2026-10-09T20:00:00.000Z', correlationId: 'c', data })

  it('ends sessions and removes accounts as Identity says', async () => {
    log.length = 0
    for (const type of ['identity.paused', 'identity.suspended', 'identity.closure-requested']) await handle(event(type, { identityId: 'p' }))
    await handle(event('identity.provisioning-expired', { identityId: 'q' }))
    await handle(event('identity.closed', { identityId: 'p' }))
    await handle(event('identity.resumed', { identityId: 'p' }))
    expect(log).toEqual(['revoke p', 'revoke p', 'revoke p', 'discard q', 'delete p'])
  })

  it('keeps roles in step with ownership and membership', async () => {
    log.length = 0
    await handle(event('group.created', { groupId: 'g', lineage: ['g'], foundingOwnerId: 'o' }))
    await handle(event('membership.added', { membershipId: 'm', identityId: 'a', groupId: 'g', kind: 'member', owner: false }))
    await handle(event('membership.added', { membershipId: 'n', identityId: 'b', groupId: 'g', kind: 'guest', owner: false }))
    await handle(event('group.owners-changed', { groupId: 'g', added: ['a'], removed: ['o'] }))
    await handle(event('membership.ended', { membershipId: 'n', identityId: 'b', groupId: 'g' }))
    expect(log).toEqual([
      'assign owner o@g by iam-integration',
      'assign member a@g by iam-integration',
      'assign viewer b@g by iam-integration',
      'assign owner a@g by iam-integration',
      'unassign owner o@g',
      'unassign all b@g',
    ])
  })
})

describe('Identity events for Profile', () => {
  const event = (type: string, data: Record<string, unknown>) => ({ eventId: 'e', type, occurredAt: '2026-10-09T20:00:00.000Z', correlationId: 'c', data })
  const deps = {
    async revokeSessions() {},
    async discardAccount() {},
    async deleteAccount() {},
    async assignRole() {},
    async unassignRole() {},
  }

  it('forwards provisioning, departures and closure to Profile, unchanged, before the other members act', async () => {
    const order: string[] = []
    const forwarded: unknown[] = []
    const handle = createIdentityEventHandler({
      ...deps,
      async deleteAccount(id) { order.push(`delete ${id}`) },
      async applyProfileEvent(received) { forwarded.push(received); order.push(`profile ${received.type}`) },
    })
    const provisioned = event('identity.provisioned', { identityId: 'p', kind: 'person' })
    await handle(provisioned)
    await handle(event('membership.ended', { membershipId: 'm', identityId: 'p', groupId: 'g' }))
    await handle(event('identity.resumed', { identityId: 'p' }))
    await handle(event('group.renamed', { groupId: 'g' }))
    await handle(event('group.created', { groupId: 'g', lineage: ['g'], foundingOwnerId: 'o' }))
    await handle(event('identity.closed', { identityId: 'p' }))
    expect(forwarded[0]).toBe(provisioned)
    expect(order).toEqual(['profile identity.provisioned', 'profile membership.ended', 'profile group.renamed', 'profile identity.closed', 'delete p'])
  })

  it('needs no Profile, and fails the event when Profile fails, so the relay delivers it again', async () => {
    await expect(createIdentityEventHandler(deps)(event('identity.provisioned', { identityId: 'p' }))).resolves.toBeUndefined()
    const failing = createIdentityEventHandler({ ...deps, async applyProfileEvent() { throw new Error('profile down') } })
    await expect(failing(event('identity.closed', { identityId: 'p' }))).rejects.toThrow('profile down')
  })
})

describe('legal holds and erasure on closure', () => {
  const event = (type: string, data: Record<string, unknown>) => ({ eventId: 'e', type, occurredAt: '2026-10-09T20:00:00.000Z', correlationId: 'c', data })
  const setup = (held: readonly ('profile' | 'authentication' | 'authorisation')[]) => {
    const log: string[] = []
    const erasures = {
      async deleteAccount(id: string) { log.push(`delete ${id}`) },
      async erasePrincipal(input: { principalId: string, actorPrincipalId: string }) { log.push(`erase ${input.principalId} by ${input.actorPrincipalId}`) },
      async recordRequestPart(input: { identityId: string, part: string, correlationId: string }) { log.push(`done ${input.part} ${input.identityId} ${input.correlationId}`) },
    }
    const handle = createIdentityEventHandler({
      ...erasures,
      async revokeSessions() {},
      async discardAccount() {},
      async assignRole() {},
      async unassignRole() {},
      async applyProfileEvent(received) { log.push(`profile ${received.type}`) },
      async heldParts() { return held },
    })
    return { log, handle, profile: createProfileEventHandler(erasures) }
  }

  it('erases Authentication and Authorisation after Profile, and tells Profile each part is done', async () => {
    const { log, handle } = setup([])
    await handle(event('identity.closed', { identityId: 'p' }))
    expect(log).toEqual(['profile identity.closed', 'delete p', 'done authentication p c', 'erase p by iam-integration', 'done authorisation p c'])
  })

  it('leaves held parts alone until Profile says the hold has ended for a closed identity', async () => {
    const { log, handle, profile } = setup(['authentication', 'profile'])
    await handle(event('identity.closed', { identityId: 'p' }))
    expect(log).toEqual(['profile identity.closed', 'erase p by iam-integration', 'done authorisation p c'])
    log.length = 0
    await profile(event('profile.legal-hold-ended', { identityId: 'p', released: ['authentication'], identityClosed: false }))
    await profile(event('profile.legal-hold-placed', { identityId: 'p' }))
    expect(log).toEqual([])
    await profile(event('profile.legal-hold-ended', { identityId: 'p', released: ['authentication', 'profile'], identityClosed: true }))
    expect(log).toEqual(['delete p', 'done authentication p c'])
  })

  it('fails the event when the holds cannot be read, so nothing is erased that might be held', async () => {
    const handle = createIdentityEventHandler({
      async revokeSessions() {},
      async discardAccount() {},
      async deleteAccount() { throw new Error('must not erase') },
      async assignRole() {},
      async unassignRole() {},
      async heldParts() { throw new Error('profile down') },
    })
    await expect(handle(event('identity.closed', { identityId: 'p' }))).rejects.toThrow('profile down')
  })
})

describe('Profile\'s data-subject request coordination', () => {
  it('asks each member for its part by its own name for the person, and a missing member holds nothing', async () => {
    const calls: unknown[] = []
    const coordinator = profileRequestCoordinatorFromMembers({
      async exportIdentity(input) { calls.push(['identity', input]); return { identity: 'i' } },
      async exportAuthentication(input) { calls.push(['authentication', input]); return null },
    })
    expect(await coordinator.exportPart({ identityId: 'p', part: 'identity', correlationId: 'c' })).toEqual({ identity: 'i' })
    expect(await coordinator.exportPart({ identityId: 'p', part: 'authentication', correlationId: 'c' })).toBeNull()
    expect(await coordinator.exportPart({ identityId: 'p', part: 'authorisation', correlationId: 'c' })).toBeNull()
    expect(calls).toEqual([['identity', { identityId: 'p', correlationId: 'c' }], ['authentication', { principalId: 'p', correlationId: 'c' }]])
  })

  it('rejects for a failing member or an unknown part, never answering as if nothing were held', async () => {
    const coordinator = profileRequestCoordinatorFromMembers({ async exportAuthorisation() { throw new Error('down') } })
    await expect(coordinator.exportPart({ identityId: 'p', part: 'authorisation', correlationId: 'c' })).rejects.toThrow('down')
    await expect(coordinator.exportPart({ identityId: 'p', part: 'toString' as never, correlationId: 'c' })).rejects.toThrow()
  })
})

describe('Profile access decision from Authorisation', () => {
  const subject = { principalId: 'a', authenticatedAt: '2026-10-09T20:00:00.000Z', assurance: { level: 'aal1' as const, phishingResistant: false } }

  it('asks about the group itself, and any refusal is false', async () => {
    const asked: unknown[] = []
    const decision = profileAccessDecisionFromAuthorisation({
      async authorise(input) {
        asked.push(input)
        return input.resource.id === 'g' ? { allowed: true } : { allowed: false, reason: 'insufficient-assurance', requirement: { minimumLevel: 'aal2', phishingResistant: false, maxAuthenticationAgeSeconds: null } }
      },
    })
    expect(await decision.allows({ subject, permission: 'profile.suspended-people:view', groupId: 'g' })).toBe(true)
    expect(await decision.allows({ subject, permission: 'profile.suspended-people:view', groupId: 'h' })).toBe(false)
    expect(asked[0]).toEqual({ subject, permission: 'profile.suspended-people:view', resource: { type: 'profile.suspended-people', id: 'g', owningGroupId: 'g' }, requestTenantId: null })
  })

  it('rejects when Authorisation fails, so Profile fails closed', async () => {
    const decision = profileAccessDecisionFromAuthorisation({ async authorise() { throw new Error('down') } })
    await expect(decision.allows({ subject, permission: 'profile.suspended-people:view', groupId: 'g' })).rejects.toThrow('down')
  })
})

describe('credential recovery', () => {
  it('records Authentication\'s event with Identity, and nothing else', async () => {
    const recorded: unknown[] = []
    const handle = createAuthenticationEventHandler({ async record(input) { recorded.push(input) } })
    await handle({ type: 'authentication.signed-in', occurredAt: '2026-10-09T20:00:00.000Z', principalId: 'p' })
    await handle({ type: 'authentication.credentials-recovered', occurredAt: '2026-10-09T20:00:00.000Z', principalId: 'p' })
    expect(recorded).toEqual([{ identityId: 'p', recoveredAt: '2026-10-09T20:00:00.000Z', correlationId: expect.stringMatching(UUID) }])
  })

  it('reconciles every page of records, returning the cursor to resume from', async () => {
    const pages: Record<string, { recoveries: { principalId: string, recoveredAt: string }[], next: string | null }> = {
      start: { recoveries: [{ principalId: 'a', recoveredAt: '1' }, { principalId: 'b', recoveredAt: '2' }], next: 'c1' },
      c1: { recoveries: [{ principalId: 'c', recoveredAt: '3' }], next: null },
    }
    const recorded: string[] = []
    const result = await reconcileCredentialRecoveries({
      async list({ after }) { return pages[after ?? 'start']! },
      async record(input) { recorded.push(input.identityId) },
    })
    expect(recorded).toEqual(['a', 'b', 'c'])
    expect(result).toEqual({ recorded: 3, after: 'c1' })
  })
})

describe('invitation delivery', () => {
  const subject = { principalId: 'inviter', authenticatedAt: '2026-10-10T10:00:00.000Z', assurance: { level: 'aal1' as const, phishingResistant: false } }
  const token = 'A'.repeat(43)
  function joining(log: unknown[]): IdentityJoiningLike {
    return {
      async invite(input) {
        log.push(['invite', input])
        return { invitationId: 'i', token, expiresAt: '2026-10-24T10:00:00.000Z', requiresConfirmation: input.kind === 'guest' }
      },
      async revoke(input) { log.push(['revoke', input]) },
    }
  }

  it('asks Identity for an unbound invitation and delivers the link with the token in the fragment', async () => {
    const log: unknown[] = []
    const delivered: InvitationMessage[] = []
    const sender = invitationSenderFromIdentity({ joining: joining(log), deliver: async (m) => { delivered.push(m) }, acceptanceUrl: 'https://example.org/invitations/accept' })
    const answer = await sender.send({ subject, groupId: 'g', kind: 'guest', address: 'someone@example.org', correlationId: 'c' })
    expect(answer).toEqual({ invitationId: 'i', expiresAt: '2026-10-24T10:00:00.000Z', requiresConfirmation: true })
    expect(log).toEqual([['invite', { subject, groupId: 'g', kind: 'guest', inviteeIdentityId: null, membershipStartsAt: undefined, membershipEndsAt: undefined, correlationId: 'c' }]])
    expect(JSON.stringify(log)).not.toContain('someone@example.org')
    expect(delivered).toEqual([{ address: 'someone@example.org', link: `https://example.org/invitations/accept#${token}`, groupId: 'g', kind: 'guest', expiresAt: '2026-10-24T10:00:00.000Z', correlationId: 'c' }])
    expect(JSON.stringify(answer)).not.toContain(token)
  })

  it('answers the same whatever the address', async () => {
    const sender = invitationSenderFromIdentity({ joining: joining([]), deliver: async () => {}, acceptanceUrl: 'https://example.org/invitations/accept' })
    const known = await sender.send({ subject, groupId: 'g', kind: 'member', address: 'known@example.org', correlationId: 'c' })
    const unknown = await sender.send({ subject, groupId: 'g', kind: 'member', address: 'nobody@example.org', correlationId: 'c' })
    expect(known).toEqual(unknown)
  })

  it('refuses an unusable address before asking Identity', async () => {
    const log: unknown[] = []
    const sender = invitationSenderFromIdentity({ joining: joining(log), deliver: async () => {}, acceptanceUrl: 'https://example.org/invitations/accept' })
    for (const address of ['', 'a b@example.org', 'x\u0000@example.org', 'a'.repeat(321)]) {
      await expect(sender.send({ subject, groupId: 'g', kind: 'member', address, correlationId: 'c' })).rejects.toBeInstanceOf(InvitationAddressError)
    }
    expect(log).toEqual([])
  })

  it('revokes the invitation and rejects when delivery refuses it', async () => {
    const log: unknown[] = []
    const sender = invitationSenderFromIdentity({ joining: joining(log), deliver: async () => { throw new Error('undeliverable') }, acceptanceUrl: 'https://example.org/invitations/accept' })
    await expect(sender.send({ subject, groupId: 'g', kind: 'member', address: 'a@example.org', correlationId: 'c' })).rejects.toThrow('undeliverable')
    expect(log[1]).toEqual(['revoke', { subject, invitationId: 'i', correlationId: 'c' }])
  })

  it('rejects when Identity refuses, delivering nothing', async () => {
    const delivered: unknown[] = []
    const sender = invitationSenderFromIdentity({
      joining: { async invite() { throw new Error('forbidden') }, async revoke() {} },
      deliver: async (m) => { delivered.push(m) },
      acceptanceUrl: 'https://example.org/invitations/accept',
    })
    await expect(sender.send({ subject, groupId: 'g', kind: 'member', address: 'a@example.org', correlationId: 'c' })).rejects.toThrow('forbidden')
    expect(delivered).toEqual([])
  })

  it('accepts only an https acceptance page without query or fragment (localhost aside)', () => {
    const base = { joining: joining([]), deliver: async () => {} }
    expect(() => invitationSenderFromIdentity({ ...base, acceptanceUrl: 'http://example.org/invitations/accept' })).toThrow(TypeError)
    expect(() => invitationSenderFromIdentity({ ...base, acceptanceUrl: 'https://example.org/accept?x=1' })).toThrow(TypeError)
    expect(() => invitationSenderFromIdentity({ ...base, acceptanceUrl: 'http://localhost:3000/invitations/accept' })).not.toThrow()
  })
})

describe('break-glass rotation', () => {
  const used = (breakGlassIdentityId: string) => ({ type: 'break-glass.used', occurredAt: '2026-10-10T10:00:00.000Z', correlationId: 'c', data: { reviewId: 'r', breakGlassIdentityId, action: 'suspend-identity', targetId: 't', reasonCode: 'incident' } })
  const base = { async revokeSessions() {}, async discardAccount() {}, async deleteAccount() {}, async assignRole() {}, async unassignRole() {} }

  it('rotates the passkey after every use and delivers the new enrolment link to operators', async () => {
    const log: unknown[] = []
    const handle = createIdentityEventHandler({
      ...base,
      breakGlass: {
        async rotate(input) { log.push(['rotate', input]); return { enrolmentToken: 'T'.repeat(43), expiresAt: '2026-10-10T11:00:00.000Z' } },
        enrolmentUrl: 'https://example.org/break-glass/enrol',
        async deliver(input) { log.push(['deliver', input]) },
      },
    })
    await handle(used('bg') as never)
    expect(log).toEqual([
      ['rotate', { identityId: 'bg', correlationId: 'c' }],
      ['deliver', { identityId: 'bg', link: `https://example.org/break-glass/enrol#${'T'.repeat(43)}`, expiresAt: '2026-10-10T11:00:00.000Z', correlationId: 'c' }],
    ])
  })

  it('rejects when rotation fails, so the relay delivers the event again', async () => {
    const handle = createIdentityEventHandler({ ...base, breakGlass: { async rotate() { throw new Error('down') }, enrolmentUrl: 'https://example.org/e', async deliver() {} } })
    await expect(handle(used('bg') as never)).rejects.toThrow('down')
  })

  it('does nothing without a rotation composed', async () => {
    await expect(createIdentityEventHandler(base)(used('bg') as never)).resolves.toBeUndefined()
  })
})

describe('Authorisation governance from Identity', () => {
  const group = {
    groupId: 'g', tenantId: 't', kind: 'personal' as const, state: 'active' as const, parentGroupId: null, rootGroupId: 'g', personalOfIdentityId: 'p',
    approvals: { required: { low: 0 as const, medium: 0 as const, high: 1 as const, critical: 2 as const }, referenceRequired: false },
    safetyPeriods: { publishedDelayHighHours: 72, publishedDelayCriticalHours: 168, approvalExpiryDays: 7, recoveryHoldHours: 72 },
    requester: { recoveryHoldUntil: null, controls: ['s'] },
  }

  it('passes Identity\'s facts through, with principals for identities', async () => {
    const asked: unknown[] = []
    const governance = authorisationGovernanceFromIdentity({
      governance: {
        async describeGroup(input) { asked.push(input); return input.groupId === 'g' ? group : null },
        async isOwner(input) { asked.push(input); return input.identityId === 'o' },
        async countOwners(input) { asked.push(input); return 2 },
      },
    })
    const { personalOfIdentityId: _, ...rest } = group
    expect(await governance.describeGroup({ groupId: 'g', principalId: 'p', correlationId: 'c' })).toEqual({ ...rest, personalOfPrincipalId: 'p' })
    expect(await governance.describeGroup({ groupId: 'x', principalId: 'p', correlationId: 'c' })).toBeNull()
    expect(await governance.isOwner({ principalId: 'o', groupId: 'g' })).toBe(true)
    expect(await governance.countOwners({ groupId: 'g', excluding: ['p'] })).toBe(2)
    expect(asked).toEqual([
      { groupId: 'g', identityId: 'p', correlationId: 'c' },
      { groupId: 'x', identityId: 'p', correlationId: 'c' },
      { identityId: 'o', groupId: 'g' },
      { groupId: 'g', excluding: ['p'] },
    ])
  })

  it('rejects when Identity fails, so Authorisation refuses the change', async () => {
    const governance = authorisationGovernanceFromIdentity({ governance: { async describeGroup() { throw new Error('down') }, async isOwner() { return false }, async countOwners() { return 0 } } })
    await expect(governance.describeGroup({ groupId: 'g', principalId: 'p', correlationId: 'c' })).rejects.toThrow('down')
  })
})

describe('default roles from Authorisation', () => {
  it('assigns the group\'s own default role for the membership kind', async () => {
    const assigned: unknown[] = []
    const handle = createIdentityEventHandler({
      async revokeSessions() {}, async discardAccount() {}, async deleteAccount() {}, async unassignRole() {},
      async assignRole(input) { assigned.push(input) },
      async defaultRoles(groupId) { return groupId === 'g' ? { member: 'contributor', guest: null } : { member: 'member', guest: 'viewer' } },
    })
    await handle({ type: 'membership.added', occurredAt: '2026-10-10T10:00:00.000Z', correlationId: 'c', data: { identityId: 'p', groupId: 'g', kind: 'member', owner: false } } as never)
    await handle({ type: 'membership.added', occurredAt: '2026-10-10T10:00:00.000Z', correlationId: 'c', data: { identityId: 'q', groupId: 'g', kind: 'guest', owner: false } } as never)
    expect(assigned).toEqual([{ principalId: 'p', groupId: 'g', roleId: 'contributor', actorPrincipalId: 'iam-integration' }])
  })
})

describe('group and tenant disposal', () => {
  const event = (type: string, data: Record<string, unknown>) => ({ eventId: 'e', type, occurredAt: '2026-10-10T09:00:00.000Z', correlationId: 'c', data })
  const setup = () => {
    const log: string[] = []
    const handle = createIdentityEventHandler({
      async revokeSessions() {},
      async discardAccount() {},
      async deleteAccount() {},
      async assignRole() {},
      async unassignRole() {},
      async applyProfileEvent(received) { log.push(`profile ${received.type}`) },
      async disposeGroup(input) { log.push(`dispose group ${input.groupId} ${input.correlationId}`) },
      async disposeTenant(input) { log.push(`dispose tenant ${input.tenantId} ${input.correlationId}`) },
    })
    return { log, handle }
  }

  it('disposes of a deleted group in Authorisation and gives the event to Profile when disposal is due', async () => {
    const { log, handle } = setup()
    await handle(event('group.deleted', { groupId: 'g', tenantId: 't', kind: 'standard', disposal: 'due' }))
    expect(log).toEqual(['profile group.deleted', 'dispose group g c'])
  })

  it('waits for group.disposal-due while a hold defers disposal', async () => {
    const { log, handle } = setup()
    await handle(event('group.deleted', { groupId: 'g', tenantId: 't', kind: 'standard', disposal: 'deferred' }))
    expect(log).toEqual(['profile group.deleted'])
    await handle(event('group.disposal-due', { groupId: 'g', tenantId: 't' }))
    expect(log).toEqual(['profile group.deleted', 'profile group.disposal-due', 'dispose group g c'])
  })

  it('disposes of a closed tenant\'s own part in Authorisation, only when due', async () => {
    const { log, handle } = setup()
    await handle(event('tenant.closed', { tenantId: 't', disposal: 'deferred' }))
    await handle(event('tenant.closing', { tenantId: 't' }))
    expect(log).toEqual([])
    await handle(event('tenant.disposal-due', { tenantId: 't' }))
    await handle(event('tenant.closed', { tenantId: 'u', disposal: 'due' }))
    expect(log).toEqual(['dispose tenant t c', 'dispose tenant u c'])
  })

  it('needs nothing from Profile or Authorisation on re-homing', async () => {
    const { log, handle } = setup()
    await handle(event('identity.rehomed', { identityId: 'p', fromTenantId: 't', toTenantId: 'u' }))
    expect(log).toEqual([])
  })

  it('rejects when Authorisation fails, so the relay delivers the event again', async () => {
    const handle = createIdentityEventHandler({
      async revokeSessions() {},
      async discardAccount() {},
      async deleteAccount() {},
      async assignRole() {},
      async unassignRole() {},
      async disposeGroup() { throw new Error('authorisation down') },
    })
    await expect(handle(event('group.deleted', { groupId: 'g', disposal: 'due' }))).rejects.toThrow('authorisation down')
  })
})

describe('disposal confirmations', () => {
  const event = (type: string, data: Record<string, unknown>) => ({ eventId: 'e1', type, occurredAt: '2026-10-10T09:00:00.000Z', correlationId: 'c', data })

  it('relays each member\'s confirmation to Identity, naming the member by the event\'s prefix', async () => {
    const recorded: unknown[] = []
    const handle = createDisposalConfirmationHandler({ async record(input) { recorded.push(input) } })
    await handle(event('authorisation.group-disposed', { groupId: 'g' }))
    await handle(event('profile.group-disposed', { groupId: 'g' }))
    await handle(event('documents.group-disposed', { groupId: 'g' }))
    await handle(event('authorisation.tenant-disposed', { tenantId: 't' }))
    expect(recorded).toEqual([
      { subject: { kind: 'group', id: 'g' }, member: 'authorisation', eventId: 'e1', correlationId: 'c' },
      { subject: { kind: 'group', id: 'g' }, member: 'profile', eventId: 'e1', correlationId: 'c' },
      { subject: { kind: 'group', id: 'g' }, member: 'documents', eventId: 'e1', correlationId: 'c' },
      { subject: { kind: 'tenant', id: 't' }, member: 'authorisation', eventId: 'e1', correlationId: 'c' },
    ])
  })

  it('ignores other events, Identity\'s own, and confirmations without a subject', async () => {
    const recorded: unknown[] = []
    const handle = createDisposalConfirmationHandler({ async record(input) { recorded.push(input) } })
    await handle(event('authorisation.role-expired', { groupId: 'g' }))
    await handle(event('identity.group-disposed', { groupId: 'g' }))
    await handle(event('Profile.group-disposed', { groupId: 'g' }))
    await handle(event('profile.group-disposed', {}))
    await handle(event('authorisation.tenant-disposed', { groupId: 'g' }))
    expect(recorded).toEqual([])
  })

  it('rejects when Identity fails, so the confirmation is delivered again', async () => {
    const handle = createDisposalConfirmationHandler({ async record() { throw new Error('identity down') } })
    await expect(handle(event('profile.group-disposed', { groupId: 'g' }))).rejects.toThrow('identity down')
  })
})

describe('legal holds for retention and disposal', () => {
  it('asks Identity about groups and tenants, and Profile about the member\'s own part of a person', async () => {
    const asked: unknown[] = []
    const holds = legalHoldsFromMembers({
      part: 'authentication',
      async groupOrTenantHeld(subject) { asked.push(subject); return subject.id === 'held' },
      async personHeldParts(identityId) { return identityId === 'p' ? ['authentication'] : ['profile'] },
    })
    expect(await holds.covers({ kind: 'group', id: 'held' })).toBe(true)
    expect(await holds.covers({ kind: 'tenant', id: 'free' })).toBe(false)
    expect(await holds.covers({ kind: 'person', id: 'p' })).toBe(true)
    expect(await holds.covers({ kind: 'person', id: 'q' })).toBe(false)
    expect(asked).toEqual([{ kind: 'group', id: 'held' }, { kind: 'tenant', id: 'free' }])
  })

  it('has no holds on people without Profile, and rejects when a member fails', async () => {
    const holds = legalHoldsFromMembers({ part: 'authorisation', async groupOrTenantHeld() { throw new Error('identity down') } })
    expect(await holds.covers({ kind: 'person', id: 'p' })).toBe(false)
    await expect(holds.covers({ kind: 'group', id: 'g' })).rejects.toThrow('identity down')
  })
})

describe('tenant governance export', () => {
  const subject = { principalId: 'o', authenticatedAt: '2026-10-10T09:00:00.000Z', assurance: { level: 'aal2' as const, phishingResistant: true } }

  it('asks Identity first, then Authorisation, and returns both parts unchanged', async () => {
    const order: string[] = []
    const { exportTenant } = tenantExportFromMembers({
      async exportIdentityTenant(input) { order.push(`identity ${input.tenantId} ${input.subject.principalId}`); return { groups: [{ groupId: 'g1' }, { groupId: 'g2' }] } },
      async exportAuthorisationTenant(input) { order.push(`authorisation ${input.tenantId} ${input.groupIds.join(',')}`); return { roles: [] } },
    })
    expect(await exportTenant({ subject, tenantId: 't', correlationId: 'c' })).toEqual({ identity: { groups: [{ groupId: 'g1' }, { groupId: 'g2' }] }, authorisation: { roles: [] } })
    expect(order).toEqual(['identity t o', 'authorisation t g1,g2'])
  })

  it('never asks Authorisation when Identity refuses or does not know the tenant', async () => {
    const exportAuthorisationTenant = async () => { throw new Error('must not be asked') }
    const refused = tenantExportFromMembers({ async exportIdentityTenant() { throw new Error('forbidden') }, exportAuthorisationTenant })
    await expect(refused.exportTenant({ subject, tenantId: 't', correlationId: 'c' })).rejects.toThrow('forbidden')
    const unknown = tenantExportFromMembers({ async exportIdentityTenant() { return null }, exportAuthorisationTenant })
    expect(await unknown.exportTenant({ subject, tenantId: 't', correlationId: 'c' })).toBeNull()
  })

  it('rejects the whole export when Authorisation fails, and has no Authorisation part without it', async () => {
    const failing = tenantExportFromMembers({ async exportIdentityTenant() { return { groups: [] } }, async exportAuthorisationTenant() { throw new Error('down') } })
    await expect(failing.exportTenant({ subject, tenantId: 't', correlationId: 'c' })).rejects.toThrow('down')
    const alone = tenantExportFromMembers({ async exportIdentityTenant() { return { groups: [] } } })
    expect(await alone.exportTenant({ subject, tenantId: 't', correlationId: 'c' })).toEqual({ identity: { groups: [] }, authorisation: null })
  })
})

describe('service identities', () => {
  const person = { principalId: 'person-1', authenticatedAt: '2026-10-11T09:00:00.000Z', assurance: { level: 'aal2' as const, phishingResistant: true } }
  const asked: unknown[] = []
  let answer: boolean | Error = true
  const services: IdentityServiceIdentitiesLike = {
    async mayManageCredentials(input) {
      asked.push(input)
      if (answer instanceof Error) throw answer
      return answer
    },
    async describe({ identityId }) {
      return identityId === 'service-1' ? { identityId, owningGroupId: 'group-1', ownerIds: ['owner-1', 'owner-2'] } : null
    },
  }

  it('asks Identity whether a person may manage a service identity\'s credentials, passing only the subject\'s fields', async () => {
    const governance = authenticationServiceGovernanceFromIdentity({ services })
    answer = true
    expect(await governance.mayManage({ principal: { ...person, kind: 'person' }, serviceIdentityId: 'service-1' })).toBe(true)
    expect(asked.at(-1)).toEqual({ subject: person, identityId: 'service-1', correlationId: expect.stringMatching(UUID) })
    answer = false
    expect(await governance.mayManage({ principal: person, serviceIdentityId: 'service-1' })).toBe(false)
  })

  it('never lets a service principal manage credentials, and rejects when Identity fails', async () => {
    const governance = authenticationServiceGovernanceFromIdentity({ services })
    const before = asked.length
    expect(await governance.mayManage({ principal: { ...person, kind: 'service' }, serviceIdentityId: 'service-1' })).toBe(false)
    expect(asked).toHaveLength(before)
    answer = new Error('Identity unavailable')
    await expect(governance.mayManage({ principal: person, serviceIdentityId: 'service-1' })).rejects.toThrow('Identity unavailable')
  })

  it('tells the owning group\'s owners of each credential issued, revoked or expiring, with identifiers only', async () => {
    const delivered: ServiceCredentialNotice[] = []
    const handle = createServiceCredentialNoticeHandler({ services, async deliver(notice) { delivered.push(notice) } })
    const credential = { credentialId: 'credential-1', kind: 'secret' as const, expiresAt: '2027-01-09T09:00:00.000Z' }
    for (const type of ['authentication.service-credential-issued', 'authentication.service-credential-revoked', 'authentication.service-credential-expiring']) {
      await handle({ type, occurredAt: '2026-10-11T09:00:00.000Z', principalId: 'service-1', credential })
    }
    expect(delivered.map(notice => notice.type)).toEqual(['authentication.service-credential-issued', 'authentication.service-credential-revoked', 'authentication.service-credential-expiring'])
    expect(delivered[0]).toEqual({
      type: 'authentication.service-credential-issued',
      serviceIdentityId: 'service-1',
      owningGroupId: 'group-1',
      ownerIds: ['owner-1', 'owner-2'],
      credentialId: 'credential-1',
      credentialKind: 'secret',
      expiresAt: '2027-01-09T09:00:00.000Z',
      occurredAt: '2026-10-11T09:00:00.000Z',
    })
  })

  it('ignores other events, events without a credential, and identities that are not service identities', async () => {
    const delivered: ServiceCredentialNotice[] = []
    const handle = createServiceCredentialNoticeHandler({ services, async deliver(notice) { delivered.push(notice) } })
    const credential = { credentialId: 'credential-1', kind: 'public-key' as const, expiresAt: '2027-01-09T09:00:00.000Z' }
    await handle({ type: 'authentication.signed-in', occurredAt: '2026-10-11T09:00:00.000Z', principalId: 'service-1', credential })
    await handle({ type: 'authentication.service-credential-issued', occurredAt: '2026-10-11T09:00:00.000Z', principalId: 'service-1' })
    await handle({ type: 'authentication.service-credential-issued', occurredAt: '2026-10-11T09:00:00.000Z', principalId: 'person-1', credential })
    expect(delivered).toEqual([])
  })
})
