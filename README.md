# Give

DOS's crowdfunding platform, Vietnam first, in VND:

- **Give** (`give`): charity campaigns with flexible funding, like GoFundMe.
- **Back** (`back`): reward projects, all-or-nothing; backers pledge first and
  pay only after the goal is reached, like Kickstarter.

The platform never holds money: contributions go straight to each campaign's
receiving account, and Give records, reconciles and publishes them. The design
is in [docs/Give-Technical-Design.md](docs/Give-Technical-Design.md).

## Status

- **Production (`main` -> https://give.vn):** live on Vercel (`metados/give`),
  serving the full Give v1 + Wave 1/2 + Give v2 (`#313`–`#320`) release.
- **Beta (`dev` -> https://beta.give.vn):** integration branch targeting the
  shared DOS Supabase Beta project; each PR also gets a Vercel preview.

Shipped capabilities:

- **Core platform (M0, M1, M3 & [DESIGN.md](DESIGN.md)):** DOS.Me OAuth 2.1
  login, organizer profiles & verification, campaign drafts and moderation
  review, discovery and campaign pages, `give` VietQR donations, bank statement
  import & reconciliation, public statements, disbursement explanations &
  evidence, receiving-account swaps, refunds & returned transfers, `back`
  pledges, reward tiers and fulfillment.
- **Wave 1 & Wave 2:** public organizer profiles (`/u/[handle]`), pitch videos,
  milestone unlock notes, co-organizer editor invites (`/invites/[token]`),
  privacy-safe campaign analytics, comments with 1-level replies & moderation
  (`/admin/reports/comments`), monthly recurring donation plans
  (`/plans/stop`), and the transactional email outbox & unsubscribe flow
  (`/admin/emails`, `/email/unsubscribe`).
- **Give v2 (`#313`–`#320`):** viral sharing (dynamic Open Graph cards,
  downloadable QR posters, shareable thank-you cards), transparency moat
  (3-second transparency summary box, milestone-linked disbursement evidence,
  closing impact reports), campaign & organizer follows with pre-launch
  `"Sắp ra mắt"` notify-me teasers and donor impact summary, structured
  campaign FAQs & draft duplication, Early Bird time-limited & slot-capped
  reward tiers, Discovery 2.0 quick filters & verified statement freshness,
  peer-to-peer campaign ambassadors (`?ref=` links, opt-in leaderboard, `/me`
  links summary & visibility toggle), and moderated donor wishes wall with
  heart reactions & staff queue (`/admin/reports/wishes`).

Full release history and Production promotions are tracked in
[CHANGELOG.md](CHANGELOG.md).

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

Staff are rows in `give.admins` (`role` = `moderator`, `finance`, or `admin`).
Bootstrap the first `admin` through a reviewed DOS-Me migration or the Supabase
SQL editor; admins can then grant, change, or revoke roles with full audit
logging at `/admin/roles` (the last admin cannot be removed). Staff open
`/admin`; everyone else gets a 404 there. Staff never review their own
campaigns or money actions, and the database enforces that too.

### Cron

`apps/web/vercel.json` schedules ten Vercel Cron routes (all require
`Authorization: Bearer $CRON_SECRET` of at least 16 characters and refuse
everything when it is unset; Vercel's Hobby plan runs crons at most daily, so
use Pro for sub-daily schedules):

- `GET /api/cron/activate` (`*/5 * * * *`): runs
  `give.activate_scheduled_campaigns()` so approved campaigns go live at their
  start time (a campaign approved after its start time goes live immediately).
- `GET /api/cron/finalize-ended` (`*/5 * * * *`): runs
  `give.finalize_ended_campaigns()` to close live give campaigns and settle
  back projects past their end time.
- `GET /api/cron/reprocess-inbound` (`*/5 * * * *`): retries pending inbound
  events (webhooks, statement imports) through their channel processor in
  `src/server/inbound` and records outcomes via `give.complete_inbound_event()`.
- `GET /api/cron/remind-unexplained` (`0 2 * * *`): reminds organizers about
  unexplained outgoing transactions.
- `GET /api/cron/lapse-pledges` (`0 * * * *`): lapses unpaid pledges past their
  payment window on succeeded back projects.
- `GET /api/cron/remind-pledges` (`30 * * * *`): sends payment reminders for
  open due pledges on succeeded back projects.
- `GET /api/cron/send-outbox` (`* * * * *`): dispatches queued transactional
  emails from `give.email_outbox` with retry/backoff and hold handling.
- `GET /api/cron/purge-outbox` (`15 3 * * *`): clears addresses/payloads on
  settled (>30 days) and deleted-account outbox records (retaining idempotency
  rows) and deletes expired guest tracking tokens.
- `GET /api/cron/issue-plan-donations` (`10 * * * *`) &
  `GET /api/cron/plan-notices` (`*/10 * * * *`): monthly plans
  (DOS/Give#276). Each database function handles one plan per call; the route
  sweeps with `p_after` until no rows remain or 45 seconds pass, so overlapping
  or retried runs stay idempotent. Reminder stop links are signed with
  `GIVE_RATE_LIMIT_SECRET` under a dedicated label (required in Production, at
  least 32 characters; previews and local runs fall back to the service-role
  key), and the database keeps only the token hash. To rotate the secret
  without breaking links already sent (60 days), set the old value as
  `GIVE_RATE_LIMIT_SECRET_PREVIOUS` until they expire.

## Routes

| Route                                                                                          | Who                  | What                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                                                                            | everyone             | Home: hero statement receipt card, trending campaigns, Discovery 2.0 highlight strips (`Sắp hết hạn`, `Sắp đạt mục tiêu`, `Mới cập nhật sao kê`), and campaign types.                                                                                                                                                                                                                                                                           |
| `/campaigns`                                                                                   | everyone             | Discovery: filter by type, category, status (including `prelaunch` `"Sắp ra mắt"`), quick filters (`ending_soon`, `almost_funded`, `recently_audited`), sort, and search.                                                                                                                                                                                                                                                                       |
| `/campaigns/[slug]`                                                                            | everyone             | Public campaign / project page (and preview for organizer, accepted co-organizers, and staff): story, pitch video, transparency summary box, milestone evidence timeline, FAQs, closing impact report, statement preview, ambassador modal & opt-in leaderboard, donor wishes wall (`#tuong-loi-chuc`) with heart reactions & reporting, comments (1-level replies & reporting), public team, follow button, QR poster, and campaign reporting. |
| `/campaigns/[slug]/opengraph-image`                                                            | everyone             | Dynamic 1200×630 PNG Open Graph card rendered with local bundled Be Vietnam Pro fonts (404 on non-public/suspended campaigns; `no-store` when totals lookup fails).                                                                                                                                                                                                                                                                             |
| `/campaigns/[slug]/statement`                                                                  | everyone             | Full public bank statement (filterable by all, in, out, unexplained) with explained disbursements and public evidence photos.                                                                                                                                                                                                                                                                                                                   |
| `/campaigns/[slug]/pledge`                                                                     | signed in            | Back-project pledge creation, tier change (including Early Bird tiers), and cancellation; preserves optional `?tier=` and `?ref=`.                                                                                                                                                                                                                                                                                                              |
| `/donations/[code]`, `/donations/[code]/track`                                                 | donor / token holder | VietQR donation transfer instructions, live reconciliation status tracking, and shareable thank-you card.                                                                                                                                                                                                                                                                                                                                       |
| `/u/[handle]`                                                                                  | everyone             | Public organizer profile (bio, verification status, handle-only follow button, and public/pre-launch campaigns).                                                                                                                                                                                                                                                                                                                                |
| `/start`                                                                                       | signed in            | Organizer profile setup and new campaign draft creation.                                                                                                                                                                                                                                                                                                                                                                                        |
| `/me`                                                                                          | signed in            | Organizer public profile editor (`handle` and `bio`, preserving verification status), verification summary, and `"Liên kết đồng hành của tôi"` ambassador links with leaderboard visibility toggle.                                                                                                                                                                                                                                             |
| `/me/contributions`                                                                            | signed in            | Donor donation & pledge history, monthly recurring plans, donor impact summary card, and shareable thank-you cards.                                                                                                                                                                                                                                                                                                                             |
| `/me/pledges/[code]`                                                                           | signed in            | Backer's individual pledge details, VietQR payment instructions when due, and reward fulfillment status.                                                                                                                                                                                                                                                                                                                                        |
| `/me/notices`                                                                                  | signed in            | In-app notification inbox (review decisions, launches, updates, pledges, moderation inquiries).                                                                                                                                                                                                                                                                                                                                                 |
| `/me/accounts`                                                                                 | signed in            | Organizer receiving bank accounts: declare, verify via test transfer, and manage bindings.                                                                                                                                                                                                                                                                                                                                                      |
| `/me/statements`, `/me/statements/[batchId]`                                                   | signed in            | Organizer bank statement file upload (CSV/XLSX) and import batch status.                                                                                                                                                                                                                                                                                                                                                                        |
| `/me/campaigns`                                                                                | signed in            | Organizer's owned campaigns (with draft duplication) and accepted co-organizer (editor) campaigns.                                                                                                                                                                                                                                                                                                                                              |
| `/me/campaigns/[id]`                                                                           | owner / co-organizer | Campaign editor (content, cover, pitch video, milestones, reward tiers / Early Bird, FAQs, monthly plans, pre-launch opt-in, updates, closing impact report); owner-only tabs for `Thống kê` analytics (`?tab=analytics`) and `Đội ngũ` co-organizer invites (`?tab=team`), receiving account / swap requests, and lifecycle actions.                                                                                                           |
| `/me/campaigns/[id]/unmatched`                                                                 | the owning organizer | Manual matching of unmatched incoming bank transactions for a campaign.                                                                                                                                                                                                                                                                                                                                                                         |
| `/me/campaigns/[id]/disbursements`                                                             | the owning organizer | Outgoing transaction explanations, evidence uploads, and milestone linking.                                                                                                                                                                                                                                                                                                                                                                     |
| `/me/campaigns/[id]/fulfillment`                                                               | the owning organizer | Reward fulfillment tracking for succeeded back projects.                                                                                                                                                                                                                                                                                                                                                                                        |
| `/invites/[token]`                                                                             | signed in            | Single-use co-organizer invite preview and acceptance (`no-referrer`, `no-store`, `noindex`; guests are prompted to sign in).                                                                                                                                                                                                                                                                                                                   |
| `/admin`                                                                                       | moderators, admins   | Campaign review queue (approve, request changes, pre-launch recovery) and organizer identity verification.                                                                                                                                                                                                                                                                                                                                      |
| `/admin/accounts`                                                                              | finance, admins      | Receiving-account verification and enable/disable controls.                                                                                                                                                                                                                                                                                                                                                                                     |
| `/admin/account-swaps`                                                                         | finance, admins      | Review queue for mid-campaign receiving-account swap requests.                                                                                                                                                                                                                                                                                                                                                                                  |
| `/admin/statements`                                                                            | finance, admins      | Statement import review queue, ambiguous row resolution, trust restoration, and daily review thresholds.                                                                                                                                                                                                                                                                                                                                        |
| `/admin/unmatched`                                                                             | finance, admins      | Unmatched/explained incoming bank transaction queue (corrections, return-to-unmatched).                                                                                                                                                                                                                                                                                                                                                         |
| `/admin/own-transfers`                                                                         | finance, admins      | Pairing of own-account transfers between old and new accounts after an approved swap.                                                                                                                                                                                                                                                                                                                                                           |
| `/admin/inbound`                                                                               | finance, admins      | Parked inbound events queue (retry or dismiss with audit note).                                                                                                                                                                                                                                                                                                                                                                                 |
| `/admin/refunds`, `/admin/refunds/[id]`                                                        | finance, admins      | Refund tracking and bank returned-transfer linking.                                                                                                                                                                                                                                                                                                                                                                                             |
| `/admin/payment-requests`                                                                      | moderators, admins   | Stop/resume payment requests on succeeded back projects.                                                                                                                                                                                                                                                                                                                                                                                        |
| `/admin/evidence`                                                                              | moderators, admins   | Disbursement evidence moderation (hide/unhide with audit trail).                                                                                                                                                                                                                                                                                                                                                                                |
| `/admin/reports`                                                                               | moderators, admins   | Campaign report queue: ask the organizer, dismiss reports, suspend campaigns, or stop payment requests; no self-review.                                                                                                                                                                                                                                                                                                                         |
| `/admin/reports/comments`                                                                      | moderators, admins   | Reported campaign comments queue: hide/unhide comments, dismiss reports, and view moderation history; no self-review.                                                                                                                                                                                                                                                                                                                           |
| `/admin/reports/wishes`                                                                        | moderators, admins   | Reported donor wishes queue: hide/restore wishes and dismiss reports; no self-review.                                                                                                                                                                                                                                                                                                                                                           |
| `/admin/emails`                                                                                | admins               | Transactional email outbox status, held/retrying/dead queues, and manual retries.                                                                                                                                                                                                                                                                                                                                                               |
| `/admin/roles`                                                                                 | admins               | Staff role management (`moderator`, `finance`, `admin`) with audit history.                                                                                                                                                                                                                                                                                                                                                                     |
| `/api/analytics/event`                                                                         | everyone (`POST`)    | Privacy-safe same-origin campaign view and share-click event ingestion (bot-filtered, referrer-sanitized, rate-limited).                                                                                                                                                                                                                                                                                                                        |
| `/api/contributions/status`                                                                    | donor / token holder | Live status polling for donation/pledge transfer tracking.                                                                                                                                                                                                                                                                                                                                                                                      |
| `/api/cron/activate`, `/api/cron/finalize-ended`, `/api/cron/reprocess-inbound`                | Vercel Cron          | Scheduled campaign activation, ended-campaign finalization/settlement, and inbound event reprocessing.                                                                                                                                                                                                                                                                                                                                          |
| `/api/cron/remind-unexplained`, `/api/cron/lapse-pledges`, `/api/cron/remind-pledges`          | Vercel Cron          | Unexplained-outflow reminders, unpaid pledge lapsing, and pledge payment reminders.                                                                                                                                                                                                                                                                                                                                                             |
| `/api/cron/send-outbox`, `/api/cron/purge-outbox`                                              | Vercel Cron          | Transactional email outbox delivery and expired outbox cleanup.                                                                                                                                                                                                                                                                                                                                                                                 |
| `/api/cron/issue-plan-donations`, `/api/cron/plan-notices`                                     | Vercel Cron          | Monthly plans: monthly donation issuance, end-of-plan closure, and donor reminders.                                                                                                                                                                                                                                                                                                                                                             |
| `/plans/stop`, `/api/plans/stop`                                                               | –                    | Stop link of monthly plan reminders: the page asks first (`GET` changes nothing); `POST` or one-click `List-Unsubscribe` (RFC 8058) stops the plan.                                                                                                                                                                                                                                                                                             |
| `/email/unsubscribe`, `/api/email/unsubscribe`                                                 | –                    | Email unsubscribe link: `GET` asks first; `POST` or one-click `List-Unsubscribe` (RFC 8058) updates preferences.                                                                                                                                                                                                                                                                                                                                |
| `/media/public/...`, `/media/private/...`, `/media/public/evidence/...`, `/media/evidence/...` | –                    | Cover and disbursement evidence images from the private `give-media` bucket, served after visibility/access checks.                                                                                                                                                                                                                                                                                                                             |
| `/auth/login`, `/auth/callback`, `/auth/logout`                                                | –                    | DOS.Me OAuth 2.1 login and local-scope logout flow.                                                                                                                                                                                                                                                                                                                                                                                             |

## Security model

- Pages and server actions talk to Supabase as the signed-in user (`dbAs(token)`
  in `src/lib/supabase.ts`); PostgREST verifies the token and RLS decides what
  each person can read and write. Status changes go only through
  `give.transition_campaign()`.
- Clients may select every `give.campaigns` column except `organizer_id` and
  `review_note`; the organizer and staff read full rows through the
  `give.managed_campaigns()` RPC (`src/lib/campaigns.ts`).
- The service role (`dbService()`) is used only for server-side operations RLS
  intentionally does not grant to clients: storing cover/evidence media after
  verifying ownership under RLS, serving verified cover/evidence objects,
  invoking privileged money RPCs after verifying the caller's JWT with `dbAs()`,
  reading/sending the email outbox, and running cron routes.
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
