# Approvals (Two-Person Rule)

## Scope

A change needs a second person's approval when its risk level is `high` or `critical` and it changes governance or access: owners, role definitions, role assignments, `group-and-descendants` scope, grants beyond the tenant, suspension, service identities, reparenting and archiving. The risk levels are those of Authorisation's permission catalogue.

| Risk | Default requirement | A group may require |
|---|---|---|
| `low`, `medium` | None | One approver |
| `high` | One approver other than the requester | Two approvers |
| `critical` | One approver other than the requester, at aal2 with phishing-resistant authentication within 15 minutes | Two approvers |

A group may raise its requirement; it may never lower it below the default. Raising it is itself a `critical` change.

## Who may approve

- Any principal, other than the requester, who holds the permission being exercised in the same group (or in a group whose `group-and-descendants` assignment covers it).
- **Single-owner fallback.** Where nobody but the requester qualifies, approval may come from:
  1. an owner of the parent group; or
  2. an owner of the tenant's root group; or
  3. a **published delay**: the change takes effect after 72 hours (`high`) or 7 days (`critical`) unless cancelled. The delay is announced to every member who would qualify as an approver if they held the role, and to the requester's other sessions. The requester cannot shorten it.
- In a personal group, the person is sovereign: changes inside their own personal group need no second person, except adding another principal's grant at `critical` risk, which uses the delay.

## Steps

1. The requesting member (**Identity** for governance, **Authorisation** for roles and grants) records a pending change with its requester, risk, required approvals, expiry (7 days) and correlation identifier, and writes `approval.requested`.
2. Notification capabilities tell qualifying approvers.
3. An approver approves or rejects through the owning member, at the assurance the risk requires (**Authentication** step-up). The owning member re-checks that the approver still qualifies at decision time.
4. When the requirement is met, the owning member applies the change in the same transaction as recording the decision, and writes `approval.decided` and the change's own event.
5. A change awaiting an approver expires unapplied after 7 days. A change under a published delay does not expire; it applies when the delay ends. Either may be cancelled by the requester.

## Rules

- No one approves their own request, including through another identity they control (service identities created by the requester do not qualify).
- The approval records who, when, at which assurance, and the exact change approved. A change that differs from what was approved needs a new approval.
- Emergency changes have no bypass. Incident response uses suspension, which has its own approval at `high` risk; during a security incident a platform operator's suspension is approved by a second operator, with no delay.

## Acceptance tests

- A `critical` change by a sole owner without a parent takes effect only after 7 days and can be cancelled meanwhile.
- A group's attempt to lower its requirement below the default is refused.
- An approval by the requester, or by an approver whose qualifying role was removed after the request, is refused.
- An approved change that is modified before application is refused.
