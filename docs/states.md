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

1. A group MAY restrict pausing within the group (for example, a duty roster that needs notice). It MUST NOT prevent a person pausing their whole identity, which overrides every group's restriction.
2. While an identity is `paused`, each of its memberships behaves as `paused`, whatever its own state. Resuming the identity restores each membership's own state.
3. `ended` is final. Rejoining creates a new membership.
4. A personal group's membership is never paused, suspended or ended on its own; it follows the identity.

**Authorisation impact.** Authorisation contract 2 treats only `active` as conferring access. The view-only access of a `paused` membership needs contract 3: `paused` added to the membership statuses, conferring only permissions marked as viewing. Until then, `paused` maps to `suspended` (no access), which is the safer reading.

## 3. Group

| State | Meaning |
|---|---|
| `active` | Normal operation. At least one owner. |
| `orphaned` | No active owner remains (for example, every owner's identity was closed). No governance change is possible until [recovery](processes/recovery.md) appoints an owner. Members' access is unaffected. |
| `archived` | Read-only. No new memberships; existing memberships end or remain read-only according to the group's settings. |

Personal groups are never orphaned or archived independently of their identity.
