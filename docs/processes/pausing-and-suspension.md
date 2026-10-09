# Pausing and Suspension

Pausing is chosen by the person. Suspension is imposed by others. Both keep roles but make them inactive ([state models](../states.md)).

## Pause a membership

**Actor:** the member, at aal1.

1. **Identity** checks the group's pause setting. A group may require notice (up to 7 days) or approval for pausing within it; it may not forbid account-wide pausing.
2. **Identity** sets the membership `paused` and writes `membership.paused`.
3. **Authorisation** treats the membership as view-only (contract 3) or as no access (contract 2).
4. **Profile** hides the member from other members of the group.
5. Notification and task capabilities stop sending to, and assigning work to, the member in that group.

Resuming reverses each step and writes `membership.resumed`.

## Pause the whole account

**Actor:** the person, after reauthentication. No group can prevent it.

1. **Identity** sets the identity `paused` and writes `identity.paused`. Every membership now behaves as paused.
2. **Authentication** revokes every other session of the identity. The current session stays, so the person can still view and resume.
3. **Profile** hides the person from everyone.
4. If the person is the last active owner of a group, the group stays governable only through [recovery](recovery.md) until they resume; Identity warns the person before they confirm.

## Suspend

**Actor:**

- A **membership**: a group administrator, with a reason code. Suspending an owner is `critical` and needs [approval](approvals.md).
- An **identity**: a tenant or platform administrator, with a reason code and approval at `high` risk. An identity can be suspended only for platform-wide reasons (abuse, legal order, security incident), never to settle a group dispute.

Steps (identity):

1. **Identity** sets the identity `suspended` and writes `identity.suspended`.
2. **Authentication** revokes every session and refuses sign-in.
3. **Authorisation** denies all access derived from memberships.
4. **Profile** shows the person as suspended only to administrators who need to know.

Reinstatement is the same actors and approval, writing `identity.reinstated` or `membership.reinstated`. The person is told about suspension and reinstatement, with the reason code, unless a legal order forbids it.

## Acceptance tests

- A paused member can view but not change group information (contract 3), and receives no notifications.
- A group restriction on pausing does not stop an account-wide pause.
- Account pause revokes every session but the current one; suspension revokes all and refuses sign-in.
- Suspending an identity without approval is refused.
