# Group Lifecycle

## Create

**Actor:** any `active` identity with `identity.groups:create` in the parent group (`medium` risk) or, for a root group, `identity.root-groups:create` in the tenant (`high` risk, with [approval](approvals.md)).

1. **Identity** creates the group (`active`), records the parent if any, and adds the creator as an `active` member.
2. **Identity** records the creator as the **founding owner** and writes `group.created`.
3. **Authorisation** gives the founding owner the built-in `owner` role scoped to the group (`scope: group`), through its assignment contract, in response to `group.created`. Until that assignment exists the creator has no rights in the group beyond membership; the outbox retries until it does.

The founding owner is an ordinary owner afterwards: the title confers nothing beyond the first assignment, and creator provenance never grants access.

## Owners

- A group always has at least one active owner. Removing, demoting, pausing the membership of, or suspending the last active owner is refused, except through [recovery](recovery.md) or [account closure](account-closure.md).
- Adding an owner is `critical` and needs [approval](approvals.md). Where the group has a single owner, approval comes from an owner of the parent group or the tenant, or from the published delay.
- Transferring ownership is adding the new owner, then the old owner stepping down; both steps are audited.

## Reparent

**Actor:** an owner of the group with `identity.groups:reparent` in both the old and new parent. `critical` risk.

1. **Identity** checks the new parent is in the same tenant and that no cycle results, then moves the group and writes `group.reparented` with the old and new lineage.
2. **Authorisation** invalidates cached lineage. Any `group-and-descendants` assignment now covers or stops covering the group according to the new tree; this follows the current tree by design (Authorisation threat T17). Hosts SHOULD show the owners which inherited assignments will newly apply before approval.

## Archive

**Actor:** an owner, with approval at `high` risk.

1. **Identity** sets the group `archived`, refuses new memberships and writes `group.archived`.
2. Existing memberships end or remain read-only according to the group's archive setting; ended memberships follow [joining and leaving](joining-and-leaving.md) for departure data.
3. Domain capabilities treat the group's information as read-only.

## Acceptance tests

- The founding owner holds the `owner` role in the new group and nothing in its parent.
- Removing the last owner is refused.
- Reparenting into another tenant, or under a descendant, is refused.
- After reparenting, a `group-and-descendants` assignment on the old parent no longer reaches the group, and one on the new parent does.
