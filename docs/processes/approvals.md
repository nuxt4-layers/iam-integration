# Approvals (Two-Person Rule)

## Scope

A change needs a second person's approval when its risk level is `high` or `critical` and it changes governance or access: owners, role definitions, role assignments, `group-and-descendants` scope, grants beyond the tenant, suspension, service identities, reparenting and archiving. The risk levels are those of Authorisation's permission catalogue.

| Risk | Default requirement | A group may require |
|---|---|---|
| `low`, `medium` | One authorised person, who is never the beneficiary | One approver |
| `high` | One approver other than the requester | Two approvers |
| `critical` | One approver other than the requester, at aal2 with phishing-resistant authentication within 15 minutes | Two approvers |

A group may raise its requirement; it may never lower it below the default. Raising it is itself a `critical` change.

**No self-grant at any risk level.** Outside their own personal group, nobody assigns a role or grants access to themselves; another authorised person must make the change. This is separation of duties (improvement register item 8).

## Who may approve

- Any principal, other than the requester, who holds the permission being exercised in the same group (or in a group whose `group-and-descendants` assignment covers it).
- **Single-owner fallback.** Where nobody but the requester qualifies, approval may come from:
  1. an owner of the parent group; or
  2. an owner of the tenant's root group; or
  3. a **published delay**: the change takes effect after the configured delay (by default 72 hours for `high`, 7 days for `critical`; see [safety periods](README.md#safety-periods)) unless cancelled. The delay is announced to every member who would qualify as an approver if they held the role, and to the requester's other sessions. The requester cannot shorten it.

  The fallbacks ask for **one** owner, even where the group raised its requirement to two: they apply only because the group cannot meet its own requirement, and asking the parent's owners for two would leave it stuck again. The rules that protect every approval still hold: the requester and the beneficiary never approve, and every rule is checked again when the change applies.
- **Platform-wide changes** (a new root group, and suspending or reinstating an identity for platform-wide reasons) are approved in the **platform group** the host designates: a standard group whose owners and qualifying members are the platform's operators.
- In a personal group, the person is sovereign over themselves and everything the personal group owns: changes there, including sharing their own information with others, need no second person. Sensitive actions still require step-up authentication at the assurance the risk level sets, which protects the person if a session is stolen.

## Steps

1. The requesting member (**Identity** for governance, **Authorisation** for roles and grants, as [access administration](access-administration.md) sets out) records a pending change with its requester, beneficiary, risk, justification (a reason code and, where the group requires it, a reference), required approvals, expiry (the configured approval expiry, by default 7 days) and correlation identifier, and writes `approval.requested`.
2. Notification capabilities tell qualifying approvers.
3. An approver approves or rejects through the owning member, at the assurance the risk requires (**Authentication** step-up). The owning member re-checks that the approver still qualifies at decision time.
4. When the requirement is met, the owning member applies the change in the same transaction as recording the decision, and writes `approval.decided` and the change's own event.
5. A change awaiting an approver expires unapplied when its expiry passes. A change under a published delay does not expire; it applies when the delay ends. Either may be cancelled by the requester.
6. A change held by a [recovery hold](recovery.md) or by a less safe [safety period](README.md#safety-periods) is approved as usual, but waits as `delayed` until the hold ends, and Identity writes `approval.held` when it records it.

## Rules

- No one approves their own request, including through another identity they control (service identities created by the requester do not qualify).
- The approval records who, when, at which assurance, and the exact change approved. A change that differs from what was approved needs a new approval.
- Emergency changes have no bypass of approvals, with one constrained exception. Incident response uses suspension, which has its own approval at `high` risk; during a security incident a platform operator's suspension is approved by a second operator, with no delay. Where no second operator exists, a **break-glass account** (ADR-0007) may suspend an identity or membership, or appoint an owner to an orphaned group, at once. It holds no standing privileges, authenticates only with an offline passkey, and every use alerts every operator and affected owner and opens a mandatory review by another person; its passkey is rotated after each use.

## Acceptance tests

- A `critical` change by a sole owner without a parent takes effect only after the configured delay (7 days by default) and can be cancelled meanwhile.
- A fallback approval by one owner of the parent group applies a change in a group that requires two approvers.
- Owners of a tenant's root group, or of a group, cannot set a safety period less safe than the platform's; a platform change that shortens a delay takes effect only after the old delay.
- A group's attempt to lower its requirement below the default is refused.
- An approval by the requester, or by an approver whose qualifying role was removed after the request, is refused.
- Assigning a role or granting access to oneself outside one's personal group is refused at every risk level.
- Sharing from one's own personal group needs no approver, but requires step-up at the risk level's assurance.
- An approved change that is modified before application is refused.
