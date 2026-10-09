import { describe, expect, it } from 'vitest'
import {
  authenticationIdentityFromIdentity,
  authorisationDirectoryFromIdentity,
  createAuthenticationEventHandler,
  createIdentityEventHandler,
  identityAccessDecisionFromAuthorisation,
  identityApprovalPolicyFromAuthorisation,
  identitySubjectResolverFromAuthentication,
  reconcileCredentialRecoveries,
  rolesWithIdentityPermissions,
  uuidv7,
} from '../server/adapters'
import type { IdentityProvisioningLike } from '../server/adapters'

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
  const event = (type: string, data: Record<string, unknown>) => ({ eventId: 'e', type, correlationId: 'c', data })

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
