# Give

DOS's crowdfunding platform, Vietnam first, in VND:

- **Give** (`give`): charity campaigns with flexible funding, like GoFundMe.
- **Back** (`back`): reward projects, all-or-nothing; backers pledge first and
  pay only after the goal is reached, like Kickstarter.

The platform never holds money: contributions go straight to each campaign's
receiving account, and Give records, reconciles and publishes them. The design
is in [docs/Give-Technical-Design.md](docs/Give-Technical-Design.md).

## Status

On `dev`: M0 (DOS.Me login, organizer profiles, campaign drafts, review,
discovery and campaign pages), M1 money for give campaigns (VietQR
donations, statement import and matching, public statements,
disbursements), M3 back campaigns (pledges, reward tiers, fulfillment), and
the redesign on [DESIGN.md](DESIGN.md). What changed is in
[CHANGELOG.md](CHANGELOG.md). `main` has no Production deploy yet.

## Stack

- `apps/web`: Next.js 16 (App Router, `src/proxy.ts`), React 19, Tailwind 4,
  Vitest.
- pnpm 10 workspaces + Turborepo, Node 24.
- Data: the shared DOS Supabase project, schema `give`. **All DDL lives in
  DOS-Me** (`supabase/migrations/*give*`); this repository never changes the
  schema.
- Login: DOS.Me through the shared Supabase OAuth 2.1 server (authorization
  code + PKCE, nonce-checked `id_token`, httpOnly `__Host-` cookies).

## Getting started

```sh
nvm use            # Node 24 (see .nvmrc)
corepack enable    # pnpm from packageManager
pnpm install
cp apps/web/.env.example apps/web/.env.local   # then fill in the values below
pnpm dev           # http://localhost:3000
```

Checks (the same ones CI runs):

```sh
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm build` and `pnpm test` need no secrets; CI builds with placeholder
values.

## Environment

Set these in `apps/web/.env.local` locally and in the Vercel project for
deployed environments. Never commit real values. `NEXT_PUBLIC_*` values are
inlined at build time, so changing one needs a rebuild.

| Variable                        | Where       | What                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | public      | The DOS Supabase project URL.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public      | The project's anon (publishable) key. Every user query runs under RLS with the user's own token.                                                                                                                                                                                                                                                                                                                                                           |
| `NEXT_PUBLIC_SITE_URL`          | public      | The canonical origin, e.g. `http://localhost:3000`. Login always runs here and the OAuth `redirect_uri` is built from it, never from the Host header. Leave it unset on Vercel previews to use each preview's own origin.                                                                                                                                                                                                                                  |
| `SUPABASE_SERVICE_ROLE_KEY`     | server only | Server-side writes and reads that RLS does not allow the user (media uploads after an ownership check, money RPCs, cron routes). Never expose it.                                                                                                                                                                                                                                                                                                          |
| `OIDC_ISSUER`                   | server only | `https://<project-ref>.supabase.co/auth/v1`, the Supabase OAuth 2.1 server.                                                                                                                                                                                                                                                                                                                                                                                |
| `OIDC_CLIENT_ID`                | server only | The OAuth client registered for Give.                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `OIDC_CLIENT_SECRET`            | server only | That client's secret (confidential client, `client_secret_basic`).                                                                                                                                                                                                                                                                                                                                                                                         |
| `GIVE_RATE_LIMIT_SECRET`        | server only | Required in Production, at least 32 random characters. HMAC secret for the guest donation rate-limit keys (keyed hashes of the visitor's address and IPv6 /48; addresses are never stored). Previews fall back to `SUPABASE_SERVICE_ROLE_KEY`. Keys are sent only on Vercel production and preview deployments, whose proxy sets the address headers; elsewhere, or without the secret, guests share one bucket per campaign and Production logs an error. |
| `CRON_SECRET`                   | server only | At least 16 random characters. Vercel Cron sends it as `Authorization: Bearer <CRON_SECRET>`.                                                                                                                                                                                                                                                                                                                                                              |

The OAuth client needs the redirect URI `<origin>/auth/callback` for every
origin that signs in (localhost, previews, Production); with
`NEXT_PUBLIC_SITE_URL` set, that is `${NEXT_PUBLIC_SITE_URL}/auth/callback`. Without the OIDC
values the site still renders, and "Đăng nhập" reports that login is not
configured.

### Staff

Moderators are rows in `give.admins` (`role` = `moderator` or `admin`). There
is no UI to grant the role; add it through a reviewed DOS-Me migration or the
Supabase SQL editor by someone with database access. Staff open `/admin`;
everyone else gets a 404 there. Staff never review their own campaigns, and
the database enforces that too.

### Cron

`apps/web/vercel.json` calls `GET /api/cron/activate` every 5 minutes; it runs
`give.activate_scheduled_campaigns()` so approved campaigns go live at their
start time. A campaign approved after its start time goes live immediately.
Vercel's Hobby plan runs crons at most daily; use Pro for the 5-minute
schedule.

Every 5 minutes it also calls `GET /api/cron/finalize-ended`, which runs
`give.finalize_ended_campaigns()` to close live give campaigns past their end
time, and `GET /api/cron/reprocess-inbound`, which retries pending inbound
events (webhooks, statement imports) through their channel's processor in
`src/server/inbound` and records each outcome with
`give.complete_inbound_event()`. No channel has a processor yet, so for now it
only reports how many events are waiting. All cron routes need
`Authorization: Bearer $CRON_SECRET` (at least 16 characters) and refuse
everything when it is not set.

Monthly plans (DOS/Give#276): `GET /api/cron/issue-plan-donations` runs hourly
and `GET /api/cron/plan-notices` every 10 minutes. Each database function
handles one plan per call; the route calls it again with the last plan id
(`p_after`) until it answers no row or 45 seconds pass, so a run sweeps the
plans once and a retried or overlapping run creates nothing twice. Reminder
stop links are signed with `GIVE_RATE_LIMIT_SECRET` under a label of their
own (required in Production, at least 32 characters, and an error is logged
without it; previews and local runs fall back to the service-role key); the
database keeps only the token's hash. To rotate the secret without breaking
links already sent (60 days), set the old value as
`GIVE_RATE_LIMIT_SECRET_PREVIOUS` until they expire.

## Routes

| Route                                           | Who                  | What                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                             | everyone             | New campaigns and categories.                                                                                                                                                                                                                                                                                         |
| `/campaigns`                                    | everyone             | Discovery: filter by type and category, search title and summary.                                                                                                                                                                                                                                                     |
| `/campaigns/[slug]`                             | everyone             | Public campaign page with comments (1-level replies and reporting), public team block when co-organizers are present, and campaign reporting for signed-in visitors (hidden on previews and the organizer’s own campaign); the organizer, accepted co-organizers and staff also see a preview before it is published. |
| `/u/[handle]`                                   | everyone             | Public organizer profile (bio, avatar, verification status and public campaigns).                                                                                                                                                                                                                                     |
| `/start`                                        | signed in            | Organizer profile, then a new draft.                                                                                                                                                                                                                                                                                  |
| `/me`                                           | signed in            | Organizer public profile editor (`handle` and `bio`, preserving verification status).                                                                                                                                                                                                                                 |
| `/me/campaigns`                                 | signed in            | The organizer's owned campaigns and accepted co-organizer (editor) campaigns.                                                                                                                                                                                                                                         |
| `/me/campaigns/[id]`                            | owner / co-organizer | Editor (content, cover, pitch video, milestones, reward tiers, updates); owner-only tabs for `Thống kê` analytics (`?tab=analytics`), `Đội ngũ` co-organizer invites (`?tab=team`), lifecycle actions and money surfaces.                                                                                             |
| `/me/campaigns/[id]/fulfillment`                | the owning organizer | Fulfillment for back projects; paid pledges and delivery updates are available only after the project has succeeded.                                                                                                                                                                                                  |
| `/invites/[token]`                              | signed in            | Single-use co-organizer invite preview and acceptance (`no-referrer`, `no-store`, `noindex`; guests are prompted to sign in).                                                                                                                                                                                         |
| `/admin`                                        | moderators, admins   | Review queue (approve, request changes) and organizer verification.                                                                                                                                                                                                                                                   |
| `/admin/reports`                                | moderators, admins   | Campaign report queue: ask the organizer, dismiss reports, suspend campaigns or stop payment requests; no self-review.                                                                                                                                                                                                |
| `/admin/reports/comments`                       | moderators, admins   | Reported campaign comments queue: hide/unhide comments, dismiss reports and view moderation history; no self-review.                                                                                                                                                                                                  |
| `/api/analytics/event`                          | everyone (POST)      | Privacy-safe same-origin campaign view and share-click event ingestion (bot-filtered, referrer-sanitized, rate-limited).                                                                                                                                                                                              |
| `/api/cron/activate`                            | Vercel Cron          | Activates scheduled campaigns.                                                                                                                                                                                                                                                                                        |
| `/api/cron/finalize-ended`                      | Vercel Cron          | Closes ended give campaigns.                                                                                                                                                                                                                                                                                          |
| `/api/cron/reprocess-inbound`                   | Vercel Cron          | Retries pending inbound events.                                                                                                                                                                                                                                                                                       |
| `/api/cron/issue-plan-donations`                | Vercel Cron          | Monthly plans: issues each plan's donation for the month (once) and ends plans past the campaign's end; expires past months' unpaid plan donations.                                                                                                                                                                   |
| `/api/cron/plan-notices`                        | Vercel Cron          | Monthly plans: tells each donor once when a plan ends; second reminders where the account allows them.                                                                                                                                                                                                                |
| `/plans/stop`, `/api/plans/stop`                | –                    | Stop link of monthly plan reminders: the page asks first (GET changes nothing); POST, or the one-click `List-Unsubscribe` (RFC 8058), stops the plan.                                                                                                                                                                 |
| `/media/public/...`, `/media/private/...`       | –                    | Cover images from the private `give-media` bucket, after a visibility check.                                                                                                                                                                                                                                          |
| `/auth/login`, `/auth/callback`, `/auth/logout` | –                    | DOS.Me login flow.                                                                                                                                                                                                                                                                                                    |

## Security model

- Pages and server actions talk to Supabase as the signed-in user (`dbAs(token)`
  in `src/lib/supabase.ts`); PostgREST verifies the token and RLS decides what
  each person can read and write. Status changes go only through
  `give.transition_campaign()`.
- Clients may select every `give.campaigns` column except `organizer_id` and
  `review_note`; the organizer and staff read full rows through the
  `give.managed_campaigns()` RPC (`src/lib/campaigns.ts`).
- The service role (`dbService()`) is used in three places: storing a cover
  image and its `campaign_media` row after the caller's ownership was checked
  under RLS (the cover itself is then set with the caller's token), serving a
  cover after the viewer's own query found its `campaign_media` row, and the
  cron route.
- Uploaded files are checked by their bytes (JPEG, PNG, WebP; at most 4 MB),
  not by name or browser-sent type, then re-encoded to WebP with `sharp`, which
  drops EXIF metadata such as GPS position before the image is public.
- The `give-media` bucket is private. Covers are served by `/media/public/...`
  (only when an anonymous visitor could see the campaign; cacheable, and the
  only image URLs the optimizer accepts) and `/media/private/...` (the
  organizer and staff, from their session, never cached), see
  `src/lib/cover-urls.ts`. A draft's cover is not reachable by URL before
  review.
- Campaign stories are Markdown rendered without raw HTML or images.
- Logout (`POST /auth/logout`, same-origin only) ends the session at the
  issuer before it clears Give's cookies, so a copied refresh token stops
  working. The Supabase OAuth server publishes no RFC 7009
  `revocation_endpoint`, so Give calls Supabase Auth's
  `POST <OIDC_ISSUER>/logout?scope=local` with the session's access token
  (refreshed first if it has expired or is about to) and the anon key. That
  deletes only this login's session and its refresh tokens; the user stays
  signed in to other DOS apps. A token without a `session_id` claim is never
  sent, because Supabase would then sign the user out everywhere. Both calls
  share a 5-second deadline and never follow redirects. If revocation fails,
  the cookies are still cleared and the failure is logged as
  `auth.logout.revoke_failed` with a reason, never a token
  (`src/lib/auth/logout.ts`). A refresh token the issuer reports as already
  dead counts as nothing to revoke.

## Repository

```
apps/web/          Next.js app
  src/app/         routes (pages, server actions, route handlers)
  src/components/  shared UI
  src/lib/         auth, data layer (campaigns.ts), helpers and their tests
docs/              design and product-owner config
```

Work is tracked on the [Give Project board](https://github.com/orgs/DOS/projects/10);
PRs target `dev`, and `main` is Production.
