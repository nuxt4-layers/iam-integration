# Pausing and Suspension

Pausing is chosen by the person. Suspension is imposed by others. Both keep roles but make them inactive ([state models](../states.md)).

## How fine-grained a pause is

A pause applies at two levels, account-wide or per group. Within either level, Profile offers finer controls over what stays visible while paused, for example hiding the profile while keeping attribution on past contributions. Those controls are Profile's, specified in its contract; Identity records only the state.

## Pause a membership

**Actor:** the member, at aal1.

1. **Identity** checks the group's pause setting. In the first release the only value is `allowed`; a later release may add notice (up to 7 days) or approval for pausing within the group. No setting may forbid account-wide pausing.
2. **Identity** sets the membership `paused` and writes `membership.paused`.
3. **Authorisation** treats the membership as view-only: it confers only permissions whose effect is `view`, at `low` or `medium` risk (contract 3).
4. **Profile** hides the member from other members of the group.
5. Notification and task capabilities stop sending to, and assigning work to, the member in that group.

Resuming reverses each step and writes `membership.resumed`.

## Pause the whole account

**Actor:** the person, after reauthentication. No group can prevent it.

1. **Identity** sets the identity `paused` and writes `identity.paused`. Every membership now behaves as paused.
2. **Authorisation** treats every membership, and the person's own personal group, as view-only (contract 3).
3. **Authentication** revokes every other session of the identity. The current session stays, so the person can still view and resume.
4. **Profile** hides the person from everyone.
5. If the person is the last active owner of a group, the group stays governable only through [recovery](recovery.md) until they resume; Identity warns the person before they confirm.

## Suspend

**Actor:**

- A **membership**: a group administrator, with a reason code. Suspending an owner is `critical` and needs [approval](approvals.md).
- An **identity**: a tenant or platform administrator, with a reason code and approval at `high` risk. An identity can be suspended only for platform-wide reasons (abuse, legal order, security incident), never to settle a group dispute.

Steps (identity):

1. **Identity** sets the identity `suspended` and writes `identity.suspended`.
2. **Authentication** revokes every session and refuses sign-in.
3. **Authorisation** denies all access derived from memberships.
4. **Profile** hides the person from everyone but the administrators of each group they belong to: a lookup with the purpose `administration` in that group shows them by display name only, never other details, to a viewer who holds `profile.suspended-people:view` (`high`, so at `aal2`) on the group, which Profile asks Authorisation through its access-decision port.

Reinstatement is the same actors and approval, writing `identity.reinstated` or `membership.reinstated`. The person is told about suspension and reinstatement, with the reason code, unless a legal order forbids it.

## Acceptance tests

- A paused member can view but not change group information (Authorisation contract 3), and receives no notifications.
- A paused member cannot view material at `high` risk, and never qualifies to approve a change.
- A person who pauses their account can view, but not change, what is in their own personal group.
- A group restriction on pausing does not stop an account-wide pause.
- Account pause revokes every session but the current one; suspension revokes all and refuses sign-in.
- Suspending an identity without approval is refused.
- A suspended member is named to the group's administrators signed in at `aal2` in an administration listing, and to nobody else.
