# Provisioning

## Trigger and actors

- A person signs up through Authentication.
- A person accepts an invitation to a group (which provisions them first if they have no identity).
- An administrator of a group creates a service (non-human) identity owned by that group, at `high` risk ([service identities](service-identities.md)).

## Preconditions

- For a person to become `active` (step 5): Authentication has verified control of the sign-in identifier (for email, a verification link or code). Reserving an identifier (step 1) needs no precondition beyond a well-formed sign-up.
- For a service identity: the administrator holds `identity.service-identities:create` in the owning group, with approval ([approvals](approvals.md)).

## Steps (person)

Provisioning is two-step. Authentication's engine creates its user record, and needs the identity identifier, when the person signs up, before the sign-in identifier is verified. Identity therefore issues the identifier in a `pending` state that confers nothing, and makes the identity `active` only once Authentication confirms verification ([state models](../states.md) §1).

1. **Authentication**, on sign-up, calls the Identity provisioning port's `reserve` with an idempotency key for the attempt and no personal data. For a sign-up through an invitation, the host resolves the inviting tenant on the server and passes it as the home tenant; otherwise Identity uses the host's default home tenant.
2. **Identity** creates the identity in state `pending` and returns its identifier. A `pending` identity is not in the directory, confers nothing and publishes no event.
3. **Authentication** uses the identifier as its engine's user identifier (Better Auth accepts it through its user-creation hook, so no private map is needed), stores it against the sign-up attempt so that a retry reuses it, and sends the verification.
4. **Authentication**, once the sign-in identifier is verified (at once for a provider-verified federated sign-up), calls `confirm`.
5. **Identity**, in one transaction: creates the personal group (in the home tenant) and its permanent membership, sets the identity `active`, and writes `identity.provisioned` to its outbox.
6. **Profile** consumes `identity.provisioned` and creates an empty record. Anything the person typed at sign-up beyond the sign-in identifier (a display name, for example) is submitted to Profile by the sign-up page after step 5, as the person.
7. **Authorisation** needs no step: the personal group's role (`personalGroupRole`, default `owner`) applies from the directory.

## Steps (service identity)

Identity creates the service identity `active` at once, with the safe name the change names, owned by the group whose administrator created it and homed in that group's tenant, without a personal group (the group model leaves non-human lifecycles to explicit decision) and without Authentication's verification flow. It is a member of no group, its owning group included, until it is added to one; the owning group's administrators then issue its machine credentials in Authentication. Both are specified in [service identities](service-identities.md).

## Failure handling

| Failure | Outcome |
|---|---|
| Identity unavailable at step 1 | Sign-up refused with a retryable error; Authentication's engine creates no user, because the reservation runs inside its user-creation hook |
| Authentication fails after step 2 | The `pending` identity exists with no account. A retry reuses it (idempotent by the attempt's key) |
| Verification never completes, or `confirm` keeps failing | Identity closes a `pending` identity not confirmed within 24 hours, without a grace period, and writes `identity.provisioning-expired`; Authentication discards the unverified account. The identifier is never reissued |
| Identity unavailable at step 4 | Authentication retries `confirm` (idempotent) until it succeeds or the identity expires; the person cannot act until it succeeds |
| Profile unavailable at step 6 | The outbox retries. The person sees no display name until it succeeds |

## Events

`identity.provisioned`, `identity.provisioning-expired`.

## Acceptance tests

- Confirmation creates exactly one personal group and one membership and makes the identity `active`, atomically.
- A `pending` identity is unknown to the directory and to Authorisation, and publishes no event.
- A sign-up retried after a failure at step 3 reuses the same identity.
- No event or log line contains the sign-in identifier.
- An identity never confirmed is closed after 24 hours, and Authentication discards its account on `identity.provisioning-expired`.
- The engine's user identifier equals the identity identifier.
