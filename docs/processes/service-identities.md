# Service Identities

A service identity is a non-human principal: software that acts in the suite on a group's behalf. Identity holds it ([state models](../states.md) §1), owned by one group, with no personal group and no personal data. Authentication holds its machine credentials and authenticates it. Authorisation decides what it may do from its memberships, exactly as for a person. Profile takes no part: a service identity is not a person.

## Rules

- **Owned by a group.** Every service identity is owned by the group whose administrator created it, in that group's tenant. The owning group's administrators manage it: its name, its credentials, its memberships and its lifecycle.
- **Named safely.** Identity holds a name for each service identity, under the same safe-name rules as a group name (Identity's contract): it describes software, never a person.
- **Access only by explicit membership.** A service identity is a member of no group, its owning group included, until it is added to one. It may be added only to groups in its owning group's tenant, always as a `member`, never as an owner or a guest. Its roles follow from its memberships through Authorisation's default roles and assignments, as for anyone.
- **Never above `high`.** A service token is an `aal2` authentication that is not phishing-resistant, so a service identity can never act where a `critical` permission requires phishing resistance. It never requests, approves or decides a governance change, an access change or an invitation, never joins by request, and never owns a group.
- **Controlled by its administrators.** Whoever may manage a service identity (`identity.service-identities:manage` in its owning group) controls it. They never approve a change that benefits it, as nobody approves a change that benefits themselves ([approvals](approvals.md)).

## Creation

**Actor:** an administrator of the owning group with `identity.service-identities:create` (`high`), with [approval](approvals.md).

1. **Identity** records `service-identity.create` with the owning group and the name. When it applies, Identity creates the identity `active`, owned by the group, with its home tenant the group's tenant, and writes `identity.provisioned` (`kind: 'service'`). See [provisioning](provisioning.md#steps-service-identity).
2. **Authentication** holds nothing for it yet. **Profile** creates nothing (it keeps records for people only).

An administrator of the owning group with `identity.service-identities:manage` may rename it at any time, without approval: a name confers nothing. Identity writes `identity.renamed`.

## Credentials

### Trigger and actors

- **An administrator of the owning group**, with `identity.service-identities:manage` (`high`), after reauthentication with a phishing-resistant authenticator within 15 minutes. No second approver: creating the identity and giving it access already needed approval, and every credential is announced to the group's owners.
- **The service itself** at Authentication's token endpoint.

### Issuing, rotating and revoking

1. **Authentication** receives the request from the signed-in administrator and asks Identity, through its service-governance port ([adapters](../adapters.md#service-identities)), whether that person may manage the service identity's credentials now. Identity answers from its own record (the identity is a service identity, `active`, owned by the group) and its access decision (`identity.service-identities:manage` in the owning group). Any failure refuses.
2. **Authentication** issues one of two kinds of credential for the identity:
   - a **client secret**: 32 random bytes, returned once and stored only as a keyed digest;
   - a **public key** (a JWK, `ES256` or `EdDSA`) registered by the administrator, for signed assertions (`private_key_jwt`, RFC 7523). Authentication stores the public key only.

   Each credential expires after the host's period (90 days by default, 1 to 365). At most two are active per identity, so a new one can be rolled out before the old is revoked. A third is refused until one is revoked or expires.
3. **Authentication** writes `authentication.service-credential-issued` (the identity, the credential identifier, its kind and expiry). The host relays it through the [notice adapter](../adapters.md#service-identities) to the owners of the owning group.
4. Revoking a credential deletes it at once and ends every token issued with it (`authentication.service-credential-revoked`). Fourteen days before a credential expires, Authentication's maintenance writes `authentication.service-credential-expiring`, once, for the same owners.

### Authenticating

1. **The service** calls Authentication's token endpoint with the OAuth 2.0 client-credentials grant: its identity identifier as the client identifier, and either its secret (HTTP Basic or the request body) or a signed assertion.
2. **Authentication** checks the credential, then reads the identity's standing from Identity through its identity port, as it does for every sign-in. Only an `active` service identity receives a token.
3. **Authentication** returns an opaque bearer token, stored only as a digest, valid for a short period (15 minutes by default, 5 to 60). A failed attempt answers `invalid_client` whatever the reason, and counts against the client's throttle.
4. On every request the service sends the token as `Authorization: Bearer`. **Authentication** looks it up, reads the standing again, and gives the host a principal of kind `service` at `aal2`, not phishing-resistant, authenticated when the token was issued. A token is never a session: it sets no cookie, and the cookie-only endpoints (pages, a person's own account) refuse it.
5. **Authorisation** decides each action from the service identity's memberships and roles, through the directory, as for a person. The directory gives the actor's kind, so Authorisation refuses a service identity's request or decision on an access change.

## Memberships

### Adding a service identity to a group

**Actor:** an administrator of the owning group (`identity.service-identities:manage`), after step-up. The change is decided in the target group.

1. **Identity** records `service-identity.join` (`high`) for the service identity and the target group, in the target group, with [approval](approvals.md): an approver who holds `identity.service-identities:admit` (`high`) in the target group and does not control the service identity, or the usual fallback to an owner of the target group's parent or root group, or the published delay.
2. When it applies, **Identity** checks again that the identity is an `active` service identity, that the target group is active and in the owning group's tenant, and that the identity is not already a member. It adds a `member` membership (never an owner) and writes `membership.added`.
3. **Authorisation** gives the group's default member role on `membership.added`, as for anyone ([access administration](access-administration.md)); further roles are assigned through Authorisation's own changes.

### Removing it

The target group's administrators remove it as they remove any member ([joining and leaving](joining-and-leaving.md)). An administrator of the owning group may also take it out of any group, without approval, as a person may leave: it ends access, never grants it. Identity writes `membership.ended` (reason `removed` or `left`) and Authorisation removes its roles.

## Lifecycle

| Change | Actor | Effect |
|---|---|---|
| `service-identity.suspend` | An administrator of the owning group, `identity.service-identities:manage` (`high`), with approval in the owning group | `suspended`: Authentication refuses new tokens and ends the live ones (`identity.suspended`); its memberships confer nothing |
| `service-identity.reinstate` | The same | `active` again; new tokens may be issued with its live credentials |
| `service-identity.close` | The same | `closed`, without a grace period: its memberships end, Authentication deletes its credentials and tokens and Authorisation erases its assignments and grants (`identity.closed`); the identifier is never reused |
| `identity.suspend`, `identity.reinstate` | A platform operator, as for any identity ([pausing and suspension](pausing-and-suspension.md)) | As above |

A service identity is also closed when its tenant closes ([tenant lifecycle](tenant-lifecycle.md)) and when its owning group is deleted. The owning group can be archived only once each service identity it owns is suspended or closed ([group lifecycle](group-lifecycle.md)); deleting it closes those still suspended.

## Failure handling

- Identity unavailable when an administrator manages credentials, or when a service asks for a token or presents one: Authentication refuses (`unavailable`, or `invalid_client` at the token endpoint). It never issues or honours a token without reading the standing.
- An issued credential whose event is lost: the credential still works, and the owners learn of it from the next listing of the identity's credentials, which Authentication serves to the owning group's administrators. Notices are best effort; access never depends on them.
- Suspension or closure applied while tokens are live: the next request with any of them is refused, since the standing is read on every request; the events end them promptly as well.
- Every step that changes Identity runs through its approvals engine and outbox; a membership or lifecycle change that no longer meets its preconditions when approved is refused when it applies.

## Events

| Event | Publisher | Data |
|---|---|---|
| `identity.provisioned` | Identity | Identity, `kind: 'service'`, home tenant (the owning group's), no personal group |
| `identity.renamed` | Identity | Identity (a service identity's name changed; the name itself is in Identity's records) |
| `membership.added`, `membership.ended` | Identity | As for any membership |
| `identity.suspended`, `identity.reinstated`, `identity.closed` | Identity | As for any identity |
| `authentication.service-credential-issued` | Authentication | Identity, credential, kind (`secret` or `public-key`), expiry |
| `authentication.service-credential-revoked` | Authentication | Identity, credential, why (`revoked`, `expired`, `identity-closed`) |
| `authentication.service-credential-expiring` | Authentication | Identity, credential, expiry |
| `authentication.service-token-issued` | Authentication | Identity, credential (for audit; never the token) |

Events carry identifiers, codes and times only: never a secret, a token, a key or a name.

## Acceptance tests

- A service identity created with approval is `active` and a member of no group; it has a name, and its administrators can rename it.
- An administrator of the owning group, after phishing-resistant step-up, issues a secret shown once; anyone else, or the same person without step-up, is refused. The group's owners are told.
- The service exchanges its secret, or a signed assertion for a registered key, for a token, and with that token acts within the roles its memberships give it; a wrong secret, an expired credential or a suspended identity gets `invalid_client` or a refusal.
- A service identity is refused any `critical` action, whatever its roles, and any request or approval of a change.
- Adding it to a group in another tenant, or as an owner, is refused; adding it in its tenant needs an approver who does not control it.
- With two active credentials, the old one can be revoked without the service losing access; a third is refused; revoking a credential ends the tokens issued with it at once.
- Suspending the service identity refuses its very next request; reinstating it lets it ask for a token again; closing it deletes its credentials and ends its memberships.
- No event, log or export carries a secret, token, key or name.
