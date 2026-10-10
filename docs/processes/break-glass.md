# Break-Glass Access

A break-glass account (ADR-0007) lets a platform with too few operators act in an incident: it may suspend an identity, suspend a membership, or appoint an owner to an orphaned standard group, at once and never for itself. It holds no standing privilege, signs in only with a passkey kept offline, and every use alerts every operator and affected owner and opens a review that only another person can close ([approvals](approvals.md)). This process is the host's written procedure for provisioning, storing, using, rotating and testing it.

## Trigger and actors

- **A platform operator** provisions a break-glass account, with server access (the migration role and Authentication's server functions). There is no endpoint for it.
- **The holder** (an operator with the offline device) enrols its passkey and, in an incident, uses it.
- **Another operator**, who did not hold the passkey, closes the review (`identity.break-glass-reviews:close` in the platform group).

## Provisioning

1. **Identity**: the operator calls `provisionIdentityBreakGlass({ pool, homeTenantId, correlationId })` with the migration pool. The identity is `active`, of kind `break-glass`, with no personal group, memberships or roles.
2. **Authentication**: the operator calls `provisionAuthenticationBreakGlass({ identityId, address, correlationId })`. It creates a passkey-only account with Identity's identifier, no password or other factor, and the operator's chosen address (marked verified, used only for security notices), and returns a single-use enrolment token that expires within the hour (Authentication's policy).
3. **The holder** opens Authentication's enrolment page (by default `/break-glass/enrol`) with the token in the link's fragment, on the device that will be kept offline, and registers a passkey that verifies the user. The page offers nothing else and signs nobody in. The token is spent; a new one is issued only by rotation.
4. **The holder** stores the device offline, under the platform's physical controls, and records where it is kept.

Authentication refuses every other way in for the account: no password can be set or reset, no other factor enrolled, no federation linked, and only passkey sign-in counts, whether or not Identity's standing is consulted. Identity's sign-in status says `passkeyOnly` as well.

## Use

1. **The holder** signs in with the passkey (phishing-resistant `aal2`) and, within 15 minutes, acts through Identity's break-glass action with a reason code.
2. **Identity** applies the action at once, writes `break-glass.used` (review, account, action, target, reason code) and opens a review.
3. **The host** turns `break-glass.used` into an alert to every platform operator and every owner the action affects.
4. **The host's [event handler](../adapters.md#events)** rotates the account (`rotateAuthenticationBreakGlass`): its passkey and sessions are removed and a new enrolment link goes to the platform's operators. The account cannot act again until a holder enrols a new passkey.
5. **Another operator** reviews the use and closes the review with an outcome code (`break-glass.review-closed`).

## Testing

The procedure is exercised at least once a year, and after any change to it, in a non-production environment composed like production: provision, enrol, sign in, take one action on a test identity, see the alert and rotation, and close the review. The production account is never used for a test; its existence and the device's place are checked against the record.

## Failure handling

- An enrolment token that has expired or been used admits nobody and answers like an unknown one; the operator rotates to issue another.
- If rotation or delivery fails, `break-glass.used` is not acknowledged and the relay delivers it again; each delivery rotates afresh, so only the latest link works.
- A lost or suspected device is handled by rotation at once, which removes the passkey, and a review of every use since the last known-good check.

## Events

| Event | Publisher | Data |
|---|---|---|
| `break-glass.used`, `break-glass.review-closed` | Identity | As in Identity's contract §13 |
| `authentication.break-glass-provisioned`, `authentication.break-glass-enrolled`, `authentication.break-glass-rotated` | Authentication | The account's identifier only |

No event or log carries an enrolment token, a passkey or the account's address.

## Acceptance tests

- A break-glass account can sign in only with its passkey: a password sign-in, a password reset and enrolling another factor are refused.
- An enrolment link works once; a used or expired one answers like an unknown one, and enrolment signs nobody in.
- After a use, the account's passkey no longer signs in, and a new enrolment link reaches the operators.
- The account may suspend an identity or a membership, or appoint an owner to an orphaned group, and nothing else; never for itself.
- Every use opens a review that the holder cannot close and another operator can.
