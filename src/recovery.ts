import { newCorrelationId } from './identifiers'
import type { AuthenticationCredentialRecoveryLike, AuthenticationEventLike } from './members'

/**
 * Credential recovery, from Authentication to Identity's recovery hold
 * (processes/recovery.md). The event gives promptness; reconciling from
 * Authentication's durable records makes sure a lost event never skips the
 * hold. Identity keeps the latest recovery, so replaying is harmless.
 */
export interface RecoveryDependencies {
  /** Identity's `recordIdentityCredentialRecovery`. */
  record(input: { identityId: string, recoveredAt: string, correlationId: string }): Promise<unknown>
}

/** Handles one of Authentication's events; only `authentication.credentials-recovered` matters. */
export function createAuthenticationEventHandler(deps: RecoveryDependencies) {
  return async function handle(event: AuthenticationEventLike): Promise<void> {
    if (event.type !== 'authentication.credentials-recovered' || !event.principalId) return
    await deps.record({ identityId: event.principalId, recoveredAt: event.occurredAt, correlationId: newCorrelationId() })
  }
}

/**
 * Passes every recovery after `after` to Identity, page by page, and returns
 * the cursor to start from next time (store it, or start from null: replaying
 * is harmless, only slower).
 */
export async function reconcileCredentialRecoveries(input: RecoveryDependencies & {
  /** Authentication's `listAuthenticationCredentialRecoveries`. */
  list(input: { after?: string | null, limit?: number }): Promise<{ recoveries: AuthenticationCredentialRecoveryLike[], next: string | null }>
  after?: string | null
  pageSize?: number
}): Promise<{ recorded: number, after: string | null }> {
  let after = input.after ?? null
  let recorded = 0
  for (;;) {
    const page = await input.list({ after, limit: input.pageSize ?? 100 })
    for (const recovery of page.recoveries) {
      await input.record({ identityId: recovery.principalId, recoveredAt: recovery.recoveredAt, correlationId: newCorrelationId() })
      recorded += 1
    }
    if (!page.next) return { recorded, after }
    after = page.next
  }
}
