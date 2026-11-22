# Agent instructions for Give

These rules apply to every coding agent working on Give (Claude Code, Codex,
Qwen Code, Gemini, Antigravity, Cursor and others). `QWEN.md`, `GEMINI.md` and
`.cursor/rules` point here.

## No local Docker, no local Supabase

Local Docker and local Supabase are forbidden for Give work (owner decision
2026-11-21). Do not run `supabase start`, `supabase db start`,
`supabase db reset`, `supabase test db`, `docker run`, `docker build`,
`docker compose up`, or anything else that creates containers or databases on
the developer's machine. Forgotten local test databases filled the machine
before; this rule exists so that never happens again.

- **Database tests (pgTAP) and migration replay run in GitHub CI on the
  DOS/DOS.Me PR.** All `give` schema DDL and its pgTAP suites live in
  DOS/DOS.Me (`supabase/migrations`, `supabase/tests/database/give_*.test.sql`).
  Push the DOS.Me branch, open the PR and read the CI result: the
  `Supabase migration replay (<base>)` check replays every migration in a fresh
  database, and the `Give pgTAP tests (<base>)` check runs the Give suites and
  logs each suite's test count.
- **App checks run without Docker:** `pnpm format:check`, `pnpm lint`,
  `pnpm typecheck`, `pnpm test` (Vitest) and `pnpm build`, the same checks the
  `Lint` and `Build all apps` CI jobs run.
- **If you think you need a local database, ask the Product Owner (PO)
  instead.** Do not work around this rule.

## Other rules

- This repository never changes the database schema; DDL goes through a
  DOS/DOS.Me PR and follows DOS.Me's `AGENTS.md`.
- How the PO runs this repository (board, branches, gates, required checks) is
  in [docs/product-owner-config.md](docs/product-owner-config.md); the product
  and money design is in
  [docs/Give-Technical-Design.md](docs/Give-Technical-Design.md).
