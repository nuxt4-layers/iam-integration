import type { RiskLevel } from './members'

/**
 * The roles Identity's permissions need in Authorisation.
 *
 * Authorisation's wildcards never cover `high` or `critical` permissions, so
 * the built-in roles must name Identity's by name: the `owner` role every
 * high and critical one, the `administrator` role the high ones that run a
 * group (never ownership, approvals, reparenting, platform-wide powers or a tenant's export).
 * `low` and `medium` ones are already covered by the roles' wildcards.
 *
 * Pass the result into `provideAuthorisationPolicy({ roles })`.
 */
const NOT_FOR_ADMINISTRATORS = new Set([
  'identity.root-groups:create',
  'identity.identities:suspend',
  'identity.break-glass-reviews:close',
  // A closing tenant's governance export is for the owners of its root groups.
  'identity.tenants:export',
])

export function rolesWithIdentityPermissions<Entry extends { pattern: string }>(input: {
  /** Identity's permission definitions (`IDENTITY_PERMISSIONS`). */
  permissions: readonly { name: string, risk: RiskLevel }[]
  /** The roles to extend, e.g. `DEFAULT_AUTHORISATION_POLICY.roles`. */
  roles: { readonly owner: readonly Entry[], readonly administrator: readonly Entry[] }
}): { owner: { pattern: string }[], administrator: { pattern: string }[] } {
  const named = (entries: readonly { pattern: string }[], names: readonly string[]) => {
    const present = new Set(entries.map(entry => entry.pattern))
    return [...entries.map(entry => ({ ...entry })), ...names.filter(name => !present.has(name)).map(pattern => ({ pattern }))]
  }
  const elevated = input.permissions.filter(p => p.risk === 'high' || p.risk === 'critical')
  return {
    owner: named(input.roles.owner, elevated.map(p => p.name)),
    administrator: named(input.roles.administrator, elevated.filter(p => p.risk === 'high' && !NOT_FOR_ADMINISTRATORS.has(p.name)).map(p => p.name)),
  }
}
