# @nuxt4-layers/iam-integration — notes for Claude

## What this is
The IAM suite's integration repository (ADR-0004, ADR-0005 in `nuxt4-layers/platform-architecture`): suite architecture, cross-capability processes and, later, reference adapters between members' ports. British spelling everywhere.

## Commands
- `pnpm install`, then `pnpm check` (type check and tests of the adapters in `server/adapters/`).
- `python3 scripts/check_markdown.py` checks headings, local links and that links to other `nuxt4-layers` documents are pinned to a tag or commit. Run it after every documentation change.

## Rules
- Owns no data. Never specify storage of identity, credential, permission or personal data here; say which member owns it.
- Members never import one another. Processes run through members' public contracts, ports and outbox events.
- Adapters (`server/adapters/`) import no member: they take the members' server functions as arguments, with the shapes in `server/adapters/members.ts`. They store nothing, decide nothing a member owns, and reject when a member fails. Keep `docs/adapters.md` in step.
- Each member's own contract, data model and threat model live in that member's repository. Here: only what spans members.
- Do not restate ecosystem-wide rules; link to platform-architecture, pinned to a commit.
- Events and logs carry opaque identifiers and correlation identifiers only.
- Every process states its trigger, actors, steps per member, failure handling, events and acceptance tests.
- Keep `docs/roadmap.md` in step with the documents.
