# Account Closure

## Trigger and actors

The person, after reauthentication. Nobody else can close a person's account; administrators can suspend it ([pausing and suspension](pausing-and-suspension.md)).

## Preconditions

The person is not the last active owner of any group. Identity lists such groups; the person appoints another owner, archives the group, or chooses to leave it orphaned for [recovery](recovery.md).

## Steps

1. **Identity** sets the identity `closure-pending` with a grace period (by default 30 days, within 7 to 90; set by the host and the platform's operators, never by a group: see [safety periods](README.md#safety-periods)) and writes `identity.closure-requested`.
2. **Authentication** revokes every session. Sign-in during the grace period leads only to cancellation.
3. **Profile** hides the person from everyone and offers an export ([data-subject requests](data-subject-requests.md)).
4. The person may cancel during the grace period, after reauthentication. **Identity** restores the previous state and writes `identity.closure-cancelled`.
5. At the end of the grace period, **Identity** ends every membership (each `membership.ended`), sets the identity `closed` and writes `identity.closed`.
6. **Authorisation** removes the identity's assignments and grants.
7. **Authentication** deletes credentials and the sign-in identifier.
8. **Profile** applies each group's departure data policy, then anonymises the person by deleting their record, except anything under legal hold, and writes `profile.anonymised`.
9. The personal group and its information are deleted, unless the person exported or transferred them first.

## Failure handling

Each step after 5 is driven by `identity.closed` from Identity's outbox and retried until it succeeds. Identity records which members have confirmed; a closure not confirmed by every member within 7 days is raised to operators.

## Acceptance tests

- Cancellation during the grace period restores the identity and its memberships unchanged.
- After closure, the sign-in identifier can be used to sign up afresh, producing a new identity identifier.
- After closure, no member holds personal data for the identity except under recorded legal hold.
- Information the person created in groups stays with those groups, attributed according to each group's departure data policy.
