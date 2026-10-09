# Recovery

Two different problems: a person who cannot sign in, and a group that nobody can govern. Neither gives anyone the power to act as another person (ADR-0005 §2.2).

## Lost credentials

Owned by **Authentication**: recovery through the sign-in identifier, backup codes or another enrolled factor, under Authentication's own contract and threat model.

Cross-member rules:

1. A recovered session starts at the lowest assurance the recovery method proves. Access to `high` and `critical` permissions needs fresh step-up with a factor that survived the recovery.
2. **Authentication** writes `authentication.sessions-revoked` for every other session, and the person is told through every enrolled channel.
3. **Identity** imposes a 72-hour hold on governance changes the recovered person requests at `critical` risk, announced to their groups' co-owners.
4. Where no recovery method remains, the account cannot be recovered by an administrator. The person may sign up afresh; groups they owned follow orphaned-group recovery.

## Orphaned groups

A group is `orphaned` when no active owner remains: owners closed their accounts, paused them, or were suspended.

**Actors, in order of preference:**

1. An owner of the parent group.
2. An owner of the tenant's root group.
3. Where neither exists (a root group whose tenant has no other owners), a member of the group with the longest active membership, after a 14-day published delay that any member can object to; an objection sends the case to a platform operator.

**Steps:**

1. The actor proposes a new owner from the group's active members (or themselves, if a member).
2. **Identity** records it as a `critical` change with [approval](approvals.md); the delay applies when no second approver exists.
3. On approval, **Identity** appoints the owner, sets the group `active` and writes `group.owners-changed`; **Authorisation** assigns the `owner` role.

Recovery appoints an owner; it never reads a personal group, and personal groups are never orphaned.

## Acceptance tests

- After credential recovery, a `critical` decision is denied until step-up.
- An orphaned group gains an owner only with approval or after the published delay.
- An objection during the delay stops automatic appointment.
- No recovery path grants access to a personal group.
