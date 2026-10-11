# State Models

**Status:** Decided in the Identity design round (2026-10-09)  
Identity owns every state here. Other members read it through ports and events ([architecture](architecture.md) §3 and §4).

## 1. Identity

```text
          reserve (sign-up)
               │
               ▼
            pending ── not confirmed within 24 h ──► closed
               │
               │ confirm (sign-in identifier verified)
               ▼
 ┌──────────► active ◄──────────┐
 │  resume     │    │  reinstate │ (to the state before suspension)
 │       pause │    │ suspend    │
 │             ▼    ▼            │
 └────────── paused ──suspend──► suspended
               │                 │
               │ request closure │ (also from active)
               ▼                 ▼
         closure-pending ──cancel──► (previous state)
               │
               │ grace period ends
               ▼
             closed
```

| State | Set by | Sign-in | Access from memberships | Visible to others | Notifications |
|---|---|---|---|---|---|
| `pending` | Identity, when Authentication reserves an identifier at sign-up | Only to complete verification | None; unknown to the directory | No | Verification only |
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
5. A `pending` identity becomes `active` only when Authentication confirms that the sign-in identifier is verified; confirmation creates the personal group atomically ([provisioning](processes/provisioning.md)). An identity never confirmed is closed after 24 hours. Service and break-glass identities are created `active`.
7. A service identity is owned by a group, has a safe name and no personal group, and is suspended, reinstated and closed by its owning group's administrators with approval, or suspended by a platform operator; closing it has no grace period ([service identities](processes/service-identities.md)).
6. Suspension may be imposed on an `active` or a `paused` identity; reinstatement restores the state held before it. Closure may be requested from `active`, `paused` or `suspended`; cancellation restores the state held before it.

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
5. A membership may carry a start and an end date (scheduled joiners and leavers, contractors, guests). They are evaluated whenever the membership is read: before its start it confers nothing and is left out of directory answers; after its end it is treated as `ended` at once, and Identity later records it `ended` and writes `membership.ended`. Access never waits for a scheduled job, and there is no separate state for a scheduled membership.
6. Identity reports each membership's **effective status**, combining its own state, its dates and its identity's state, the most restrictive first: `ended`, then `suspended` (also while the identity is `suspended`, `closure-pending` or `pending`), then `paused`.

**Authorisation impact.** Authorisation contract 3 provides:

- `paused` among the membership statuses, and the principal's own status (`active`, `paused` or `suspended`, from the identity's state);
- an explicit `effect: 'view' | 'change'` attribute on every catalogue permission, defaulting to `change`, so a permission without it fails closed;
- the rule that paused standing confers only `view` permissions at `low` or `medium` risk, on every route: roles, the personal-group role and grants. A paused member is hidden from the group, so their reading of sensitive material would go unnoticed. A paused account is therefore view-only in its own personal group too, and a direct grant is view-only while every membership the person holds in the resource's tenant is paused. An active route always wins.

Contract 2 treated only `active` as conferring access; the adapter then mapped `paused` to `suspended` (no access).

## 2a. Membership kinds

| Kind | Meaning | Defaults |
|---|---|---|
| `member` | An ordinary member | The group's default role; no end date |
| `guest` | An outside collaborator | A restricted default role set by the group; an end date 90 days after joining, renewable by a group administrator |

A service identity is always a `member`, never a guest or an owner, and only in groups of its owning group's tenant ([service identities](processes/service-identities.md#memberships)).

A guest is visible, and is paused, suspended and ended through the same lifecycle as a member. Guests are preferred over Authorisation's external grants, which stay off by default and remain for one-off sharing of a single resource across tenants. Identities are global, so membership of groups in several tenants needs no guest kind; `guest` means only a restricted role and an end date.

## 3. Group

| State | Meaning |
|---|---|
| `active` | Normal operation. At least one owner. |
| `orphaned` | No active owner remains (for example, every owner's identity was closed). No governance change is possible until [recovery](processes/recovery.md) appoints an owner. Members' access is unaffected. |
| `archived` | Read-only. No new memberships; existing memberships end or remain read-only according to the group's settings. |
| `deleted` | Terminal. Confers nothing and appears in no directory answer. Its information is disposed of in every member once no legal hold covers it, leaving Identity's tombstone ([group deletion](processes/group-deletion.md)). |

Personal groups are never orphaned or archived independently of their identity. A personal group is deleted only when its identity closes, or when its person is re-homed to a tenant in another data region.

```text
active ⇄ orphaned
active → archived → deleted
```

## 4. Tenant

| State | Meaning |
|---|---|
| `active` | Normal operation. |
| `closing` | The notice period before shutdown: no new groups or memberships; people whose home tenant it is will be re-homed. Can be cancelled. |
| `closed` | Terminal. Every group in it deleted; Identity keeps a tombstone with its jurisdiction and data region. |

The [tenant lifecycle](processes/tenant-lifecycle.md) moves a tenant between them.
