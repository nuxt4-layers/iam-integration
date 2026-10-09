# Joining and Leaving

## Joining

A person joins a group by one of:

- **Invitation**: a group administrator invites an identity (or a sign-in identifier, which provisions on acceptance). The invitation is accepted by the invitee only; nobody can be added to a group without their consent, except a service identity.
- **Request**: the person asks to join; a group administrator approves.
- **Open join**: the group allows joining without approval. Off by default.

Any of these may create a `member` or a `guest` membership ([state models](../states.md) §2a). A guest gets the group's restricted guest role and an end date 90 days after joining, which a group administrator may renew.

Steps:

1. **Identity** creates the membership `active` and writes `membership.added`.
2. **Authorisation** applies the group's default role, if the group has one, through its assignment contract.
3. **Profile** applies the person's disclosure settings for this group; by default only the display name is visible to fellow members.

Invitations expire after 14 days and are single use. An invitation sent to a sign-in identifier reveals nothing about whether that identifier has an account.

An invitation is a bearer token, and **Identity never receives the address it is sent to**. The host's invitation endpoint asks Identity for an invitation, receives the token once, and passes token and address to a notification capability for delivery. Identity stores only a hash of the token, limits how many invitations a person or group may send and how many acceptance attempts an identity may make, and answers every well-formed request identically. An invitation to an existing identity is bound to it, so only that identity can accept; any other invitation can be accepted by whoever signs in with the token, being provisioned first, with the inviting tenant as their home tenant. An invitation may carry the membership's start and end dates.

**Confirming who accepted.** A bearer token can be forwarded. Each group therefore chooses, per membership kind, whether an accepted invitation takes effect at once or waits for an administrator to confirm who accepted it: by default guests wait for confirmation and members do not, and any group may require it for members too. While it waits, the person who accepted has no membership; an administrator sees who accepted (through Profile's display name) and confirms, which creates the membership, or refuses. Nobody confirms their own acceptance. A confirmation not given within 7 days expires the invitation. Invitations bound to an existing identity need no confirmation. Every acceptance tells the inviter (`invitation.accepted`), whatever the setting.

## Leaving

The member may leave at any time, except from their personal group, and except where they are the last owner (they must appoint another owner or archive the group first).

## Removal

A group administrator removes a member, recording a reason code. Removing an owner is `critical` and needs [approval](approvals.md).

## Steps on leaving or removal

1. **Identity** ends the membership (`ended`, final) and writes `membership.ended`.
2. **Authorisation** removes the role assignments and principal grants held under that membership, and stops honouring them at once: decisions read the ended membership from the directory within the consistency bound. Grants to the person that are independent of the membership (an external share, where the tenant allows them) are evaluated separately.
3. **Authentication** needs no step; sessions remain valid for the person's other groups.
4. **Profile** applies the group's **departure data policy** to the leaver's attribution in that group:

| Policy | What fellow members see on the leaver's past contributions |
|---|---|
| `keep-name` (default) | The leaver's display name as it was at departure |
| `pseudonymise` | A stable pseudonym unique to this group ("Former member 7") |
| `anonymise` | "Former member", with no link between contributions |

The leaver may always choose `anonymise` for themselves, whatever the group's policy, within the law (a legal hold, for example, records the link outside the group's view). Domain capabilities never store names, so the policy is applied by Profile's display-name lookups, not by rewriting domain records.

The group's departure data policy is a group setting held by Identity, set by its owners within the law, and supplied to Profile through the disclosure-context port. Besides the attribution above, it states:

| Field | Values | Default |
|---|---|---|
| Visibility in history | Whether the leaver appears in the group's member history, and to whom: `all-members`, `administrators`, `nobody` | `administrators` |
| Deletion requests | When the leaver asks for deletion: `anonymise` (unlink attribution; the floor), `erase-where-lawful` (domain capabilities erase the leaver's contributions unless a retention reason applies), `review` (an administrator decides within the jurisdiction's deadline) | `anonymise` |
| Retention reasons | What the group must keep (legal or contractual retention), as reason codes | None |

The leaver may ask for deletion; the group's policy decides the outcome within the law, and the anonymisation floor above always applies. The leaver's own choice of anonymisation is recorded by Profile, not Identity.

**Free text is the exception to unlinking.** Comments, documents and other text the leaver wrote can themselves contain personal data. Unlinking does not reach it. Each domain capability that stores free text handles it under the group's policy (redaction, anonymisation or retention under legal hold) and documents how in its own threat model.

## Acceptance tests

- After leaving, a high-risk decision for the leaver in that group is denied at once, and a low-risk one within the bounded consistency period.
- Information the leaver created stays with the group.
- A leaver's chosen anonymisation applies even when the group's policy is `keep-name`.
- Leaving the personal group, or leaving as the last owner, is refused.
- An invitation to an unknown sign-in identifier and to a known one produce the same response.
- Identity's store holds no invitation token or address, only a token hash; a used, revoked or expired token admits nobody.
- A membership past its end date confers nothing, even before Identity records it `ended`.
- A guest invitation accepted by a forwarded link confers nothing until an administrator confirms who accepted; a refused acceptance creates no membership; nobody confirms their own.
