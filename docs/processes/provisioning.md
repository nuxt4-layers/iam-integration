# Provisioning

## Trigger and actors

- A person signs up through Authentication.
- A person accepts an invitation to a group (which provisions them first if they have no identity).
- A tenant administrator creates a service (non-human) identity, at `high` risk.

## Preconditions

- For a person: Authentication has verified control of the sign-in identifier (for email, a verification link or code).
- For a service identity: the administrator holds `identity.service.create` in the tenant, with approval ([approvals](approvals.md)).

## Steps (person)

1. **Authentication** verifies the sign-in identifier and calls the Identity provisioning port with no personal data.
2. **Identity**, in one transaction: creates the identity (`active`), its personal group and the permanent membership, and writes `identity.provisioned` to its outbox. Returns the identity identifier.
3. **Authentication** records the identity identifier as the principal identifier and finishes creating the credential and session.
4. **Profile** consumes `identity.provisioned` and creates an empty record. Anything the person typed at sign-up beyond the sign-in identifier (a display name, for example) is submitted to Profile by the sign-up page after step 3, as the person.
5. **Authorisation** needs no step: the personal group's role (`personalGroupRole`, default `owner`) applies from the directory.

## Steps (service identity)

As above without Authentication's credential flow and without a personal group (the group model leaves non-human lifecycles to explicit decision). The service identity is a member only of groups it is explicitly added to, and its credentials are issued by Authentication's service-credential flow when one exists.

## Failure handling

| Failure | Outcome |
|---|---|
| Identity unavailable at step 1 | Sign-up refused with a retryable error; nothing created |
| Authentication fails after step 2 | The identity exists with no credential. Authentication retries step 3 with the same identity identifier (idempotent by the verification's identifier). An identity with no credential after 24 hours is closed by Identity without a grace period, since nobody can sign in to it. |
| Profile unavailable at step 4 | The outbox retries. The person sees no display name until it succeeds. |

## Events

`identity.provisioned`.

## Acceptance tests

- Provisioning creates exactly one identity, one personal group and one membership, atomically.
- A sign-up retried after a failure at step 3 reuses the same identity.
- No event or log line contains the sign-in identifier.
- An abandoned identity with no credential is closed after 24 hours.
