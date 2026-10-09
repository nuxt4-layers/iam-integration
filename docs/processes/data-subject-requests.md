# Data-Subject Requests

Profile is the person's single point of contact for requests about their data. It coordinates the other members, which each answer for what they hold. Jurisdiction-specific deadlines and exemptions are supplied by the host's policy for the tenant's jurisdiction; the defaults below follow UK data protection.

## Actors

The person, after reauthentication, or an operator acting on a verified request received outside the platform (recorded with a reason code).

## Request types

| Request | Profile | Identity | Authentication | Authorisation | Domain capabilities |
|---|---|---|---|---|---|
| Access and export | Profile record, disclosure settings | Identity state, memberships and their history | Sign-in identifiers, factors (not secrets), session list | Role assignments and grants held | Through a host-supplied export port, per capability |
| Correction | Profile record | — | Sign-in identifier change (through Authentication's own flow) | — | Their own records, through their contracts |
| Erasure | Delete the record (anonymisation) | Close the identity ([account closure](account-closure.md)) or end named memberships | Delete credentials and identifiers | Remove assignments and grants | Delete or unlink as their purpose allows |
| Objection or restriction | Restrict disclosure | Pause the identity or membership | — | — | Stop the processing objected to |

## Steps

1. **Profile** records the request with a correlation identifier and a due date (default one month from verification).
2. **Profile** asks each member, through the host's coordination adapter, to fulfil its part. Each member answers with a machine-readable bundle (export) or a confirmation (other requests). No member sends personal data to another except to Profile for an export bundle.
3. **Profile** assembles the export as a single archive available to the person for 7 days, behind reauthentication.
4. **Profile** records completion, or the exemption claimed for each part that was refused, with a reason code.

## Rules

- Requests never reveal other people's personal data. Exports of group activity show other members as Profile's disclosure rules would show them to the requester.
- Erasure is anonymisation by unlinking (ADR-0005 §2.8): domain records keep the opaque identifier.
- Legal holds are recorded by Profile with a reason code and an end date, and block only the erasure they cover.

## Acceptance tests

- An export contains each member's part and no other person's personal data.
- Erasure leaves no personal data for the person in any member except under recorded legal hold.
- A request is answered or raised to operators before its due date.
