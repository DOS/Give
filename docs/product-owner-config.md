# Product Owner config: DOS/Give

Values for the `product-owner` and `task-claim` skills (the `cc-po` plugin)
in this repository. The keys and their defaults are in the plugin's
`skills/product-owner/config-schema.md`; check this file with
`node "<plugin>/skills/product-owner/check-config.mjs" docs/product-owner-config.md`.
Sessions read this file at run time and it carries JOY's authority, so a
change to it is a change to agent instructions: it goes through a reviewed PR.

## Owner and reporting

- owner_name: JOY
- owner_profile: the repository owner, a non-coder who does not code, run
  commands or read diffs. Agents own technical decisions and bring JOY only
  material product, business, legal, risk and Production decisions,
  explained in plain words, one at a time.
- report_language: Vietnamese with full diacritics, in plain words; explain
  a technical term in Vietnamese the first time it is used, and give every
  issue or PR number with its short name. Code, comments, commits, PRs,
  issues and messages to other agents stay in English.
- agent_account: every runtime posts as the JOY GitHub account, so
  Assignees stay empty.

## Board

The board runs Scrumban with a weekly timebox: work flows Backlog → Ready →
In progress → In review → Done, and the PO plans each one-week Sprint from
Ready. WIP limit: In progress per line never exceeds `sub_sessions_max`.

- project_url: https://github.com/orgs/DOS/projects/10 (Give Project)
- project_owner: DOS
- project_number: 10
- project_id: PVT_kwDOA388Vc4BpNyb
- product_line_field: PVTSSF_lADOA388Vc4BpNybzhn9P74 (options in Lines)
- priority_field: `PVTSSF_lADOA388Vc4BpNybzhn9P7M`; Urgent `6f65939b`, High
  `52b820d2`, Normal `3792e424`, Low `ffb60822`
- sprint_field: `PVTIF_lADOA388Vc4BpNybzhn9QBw`; Sprint, 7 days
- bot_owned_fields: none. Sessions set Status, Executor and Session ID by
  hand: In progress after the claim, In review when the PR is ready, Done
  per `done_definition`. The PO sets Backlog or Ready when it creates or
  refines an issue, and Ready again when a claim ends with `release:` or a
  `handoff:` to JOY. Board ids: Status `PVTSSF_lADOA388Vc4BpNybzhnqaOo`
  (Backlog `bfaa2d05`, Ready `c09bc7a5`, In progress `983c3209`, In review
  `fc628527`, Done `3823768f`); Executor `PVTSSF_lADOA388Vc4BpNybzhn9P9g`
  (Unassigned `55bc0446`, Codex `963e84f5`, Claude Code `7c115ebb`,
  Antigravity `acb594d3`, Cursor `16aae670`); Session ID
  `PVTF_lADOA388Vc4BpNybzhn9P-Y` (text); Size
  `PVTSSF_lADOA388Vc4BpNybzhn9P7Q` (XS `8b6d997d`, S `bc54940d`, M
  `848a208e`, L `cf65ea6d`, XL `53816a43`). Set Size on every Ready issue.

## Lines

Lines follow risk and ownership, not campaign type: give (charity) and back
(rewards) share most screens and code, while money handling needs its own
stricter review and legal track.

| Line                                                   | Label            | Product Line option id | PO session                                |
| ------------------------------------------------------ | ---------------- | ---------------------- | ----------------------------------------- |
| Campaigns                                              | `line:campaigns` | `ef952ffb`             | `Campaigns Product Owner`                 |
| Money                                                  | `line:money`     | `2640fb7c`             | `Money Product Owner`                     |
| Platform (CI, release, auth, infra, DOS.Me migrations) | `line:platform`  | `9a434f49`             | none; the Campaigns Product Owner decides |

- Campaigns: organizer onboarding, campaign editor and review, discovery,
  campaign pages, updates, milestones, reward tiers and fulfillment status,
  moderation and reports.
- Money: contributions and pledges, receiving accounts, VietQR, statement
  import, PayOS/bank/crypto channels, reconciliation, ledger, refunds,
  disbursement transparency, platform fees.
- Platform: monorepo, CI, Vercel deploys, DOS.Me login, shared Supabase
  migrations in DOS/DOS.Me, observability.

## Issue fields

- issue_types: Task `IT_kwDOA388Vc4As2J7`, Bug `IT_kwDOA388Vc4As2J9`,
  Feature `IT_kwDOA388Vc4As2KA`
- org_priority_field: `IFSS_kgDOAOxu8w`; Urgent `IFSSO_kgDOAZ2tDA`, High
  `IFSSO_kgDOAZ2tDQ`, Medium `IFSSO_kgDOAZ2tDg`, Low `IFSSO_kgDOAZ2tDw`
- org_effort_field: `IFSS_kgDOAOxu9g`; High `IFSSO_kgDOAZ2tEA`, Medium
  `IFSSO_kgDOAZ2tEQ`, Low `IFSSO_kgDOAZ2tEg`
- issue_notes: none

## Rule documents

- agent_instructions: none
- task_scope: none
- tracking_doc: none
- review_rules: none
- domain_rules: `docs/Give-Technical-Design.md` for the product, money
  model and data design. All database DDL for the `give` schema lives in
  DOS/DOS.Me `supabase/migrations` and follows DOS.Me's `AGENTS.md`
  (migration ownership, review rounds, autonomous merge into its `dev`).
- roadmap_sources: `docs/Give-Technical-Design.md` section 7 (milestones
  M0 to M4) and section 9 (open questions)
- setup_guide: the cc-po plugin README
- decision_log: none

## Branches, environments and gates

- integration_branch: dev
- integration_merge: squash
- default_branch: main
- draft_pr_first: no
- production_branch: main
- production_merge: merge commit
- production_effect: no deployment is wired yet, so a merge into `main`
  only runs CI today. Once the Vercel project is connected, a merge into
  `main` deploys Production and becomes a Production step; record the
  deploy details here when that happens.
- test_environment: none yet; planned as Vercel previews per PR against the
  DOS Supabase beta project.

## Checks and review

- required_checks: `Lint` and `Build all apps` (GitHub Actions workflow
  `.github/workflows/ci.yml`, app id 15368).
- claim_gate: none
- external_review_app: none
- local_reviews: a fresh-context subagent review; Money changes also get a
  second independent review before merge.
- agent_effort: high

## Sessions

- sub_sessions_normal: 3
- sub_sessions_max: 5
- check_in_minutes: 30
- executors: Codex, "Claude Code", Antigravity, Cursor

## Owner instructions

- JOY (2026-10-29): "Làm liên tục đi"
- JOY (2026-10-31): "setup sao cho nó có scrumban đi, có time box á"
- JOY (2026-10-31), on branches: "DOS.Me lên main là lên prod mà. Chỉ là
  phải PR dev thôi. Hiện chưa có gì thì làm trên dev rồi PR main luôn nhỉ?"

Notes: the board's WIP column limits are a GitHub UI setting the API cannot
set; the PO enforces the WIP limit above. `default_branch` is still `main`;
switch it to `dev` in the repository settings if PRs should target `dev` by
default.
