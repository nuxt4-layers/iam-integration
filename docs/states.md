# State Models

**Status:** Draft for the Identity design round  
Identity owns every state here. Other members read it through ports and events ([architecture](architecture.md) §3 and §4).

## 1. Identity

```text
            provision
               │
               ▼
 ┌──────────► active ◄──────────┐
 │  resume     │    │  reinstate │
 │             │    │            │
 │       pause │    │ suspend    │
 │             ▼    ▼            │
 └────────── paused  suspended ──┘
               │      │
               ▼      ▼
         closure-pending ──cancel──► (previous state)
               │
               │ grace period ends
               ▼
             closed
```

| State | Set by | Sign-in | Access from memberships | Visible to others | Notifications |
|---|---|---|---|---|---|
| `active` | System, the person, or reinstatement | Yes | Yes, for `active` memberships | As Profile's disclosure allows | Yes |
| `paused` | The person only | Yes, to view and to resume | None: every membership behaves as paused | No | None |
| `suspended` | A tenant or platform administrator, with approval at `high` risk | No | None | As a suspended member, to administrators only | None |
| `closure-pending` | The person, or the process in [account closure](processes/account-closure.md) | Yes, only to cancel | None | No | Closure reminders only |
| `closed` | The system, at the end of the grace period | No | None | No | None |

Rules:

1. Only the person can pause or resume their own identity. No group or administrator can prevent it (ADR-0005 §2.6).
2. Suspension is imposed by others and recorded with a reason code (never free text), the actor and the approver.
3. Entering `paused`, `suspended` or `closure-pending` revokes the identity's sessions.
4. A `closed` identity is never reopened. Its identifier is never reissued.

## 2. Membership

```text
   join / add
       │
       ▼
     active ──── pause (member) ────► paused
      │  ▲ ◄────────── resume ──────────┘
      │  └──── reinstate ──── suspended
      │                           ▲
      ├──────── suspend ──────────┘
      │
      └── leave / remove / identity closed ──► ended
```

| State | Set by | Access | Roles | Visible in the group | Notifications and assignments |
|---|---|---|---|---|---|
| `active` | Join, add, resume or reinstate | Yes | In force | Yes | Yes |
| `paused` | The member | View only, where their roles allow viewing | Kept, inactive for anything but viewing | No | None |
| `suspended` | Group owners or administrators | None | Kept, inactive | To group administrators only | None |
| `ended` | Leave, removal or closure of the identity | None | Removed | No; attribution follows the group's departure data policy | None |

Rules:

1. A group's pause setting is reserved in the contract with the single value `allowed` in the first release. A later release MAY add `notice` and `approval` for pausing within the group. No setting can prevent a person pausing their whole identity, which overrides every group's restriction.
2. While an identity is `paused`, each of its memberships behaves as `paused`, whatever its own state. Resuming the identity restores each membership's own state.
3. `ended` is final. Rejoining creates a new membership.
4. A personal group's membership is never paused, suspended or ended on its own; it follows the identity.

**Authorisation impact.** Authorisation contract 2 treats only `active` as conferring access. Contract 3 adds:

- `paused` to the membership statuses;
- an explicit `effect: 'view' | 'change'` attribute on every catalogue permission, defaulting to `change`, so a permission without it fails closed;
- the rule that a `paused` membership confers only `view` permissions at `low` or `medium` risk. A paused member is hidden from the group, so their reading of sensitive material would go unnoticed.

Until contract 3, `paused` maps to `suspended` (no access), which is the safer reading.

## 2a. Membership kinds

| Kind | Meaning | Defaults |
|---|---|---|
| `member` | An ordinary member | The group's default role; no end date |
| `guest` | An outside collaborator | A restricted default role set by the group; an end date 90 days after joining, renewable by a group administrator |

A guest is visible, and is paused, suspended and ended through the same lifecycle as a member. Guests are preferred over Authorisation's external grants, which stay off by default and remain for one-off sharing of a single resource across tenants. Identities are global, so membership of groups in several tenants needs no guest kind; `guest` means only a restricted role and an end date.

## 3. Group

| State | Meaning |
|---|---|
| `active` | Normal operation. At least one owner. |
| `orphaned` | No active owner remains (for example, every owner's identity was closed). No governance change is possible until [recovery](processes/recovery.md) appoints an owner. Members' access is unaffected. |
| `archived` | Read-only. No new memberships; existing memberships end or remain read-only according to the group's settings. |

Personal groups are never orphaned or archived independently of their identity.
