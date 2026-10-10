import { describe, expect, it } from 'vitest'
import {
  authenticationIdentityFromIdentity,
  authorisationDirectoryFromIdentity,
  authorisationGovernanceFromIdentity,
  createAuthenticationEventHandler,
  createIdentityEventHandler,
  createProfileEventHandler,
  identityAccessDecisionFromAuthorisation,
  identityApprovalPolicyFromAuthorisation,
  identitySubjectResolverFromAuthentication,
  InvitationAddressError,
  invitationSenderFromIdentity,
  profileAccessDecisionFromAuthorisation,
  profileRequestCoordinatorFromMembers,
  reconcileCredentialRecoveries,
  rolesWithIdentityPermissions,
  uuidv7,
} from '../server/adapters'
import type { IdentityJoiningLike, IdentityProvisioningLike, InvitationMessage } from '../server/adapters'

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
      ],
      roles: { owner: [{ pattern: '*' }, { pattern: 'identity.groups:archive' }], administrator: [{ pattern: '*' }] },
    })
    expect(roles.owner.map(r => r.pattern)).toEqual(['*', 'identity.groups:archive', 'identity.group-owners:manage', 'identity.identities:suspend'])
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
