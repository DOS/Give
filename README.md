# Give

DOS's crowdfunding platform, Vietnam first, in VND:

- **Give** (`give`): charity campaigns with flexible funding, like GoFundMe.
- **Back** (`back`): reward projects, all-or-nothing; backers pledge first and
  pay only after the goal is reached, like Kickstarter.

The platform never holds money: contributions go straight to each campaign's
receiving account, and Give records, reconciles and publishes them. The design
is in [docs/Give-Technical-Design.md](docs/Give-Technical-Design.md).

## Status

Milestone **M0** (foundation): DOS.Me login, organizer profiles, campaign
drafts with milestones and a cover image, submission, moderator review and
organizer verification, discovery and public campaign pages. No money flows
yet; contributions, VietQR and statements arrive in M1.

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

| Variable                        | Where       | What                                                                                                                                                                                                                      |
| ------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | public      | The DOS Supabase project URL.                                                                                                                                                                                             |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public      | The project's anon (publishable) key. Every user query runs under RLS with the user's own token.                                                                                                                          |
| `NEXT_PUBLIC_SITE_URL`          | public      | The canonical origin, e.g. `http://localhost:3000`. Login always runs here and the OAuth `redirect_uri` is built from it, never from the Host header. Leave it unset on Vercel previews to use each preview's own origin. |
| `SUPABASE_SERVICE_ROLE_KEY`     | server only | Used only for cover uploads (after an RLS ownership check) and the cron route. Never expose it.                                                                                                                           |
| `OIDC_ISSUER`                   | server only | `https://<project-ref>.supabase.co/auth/v1`, the Supabase OAuth 2.1 server.                                                                                                                                               |
| `OIDC_CLIENT_ID`                | server only | The OAuth client registered for Give.                                                                                                                                                                                     |
| `OIDC_CLIENT_SECRET`            | server only | That client's secret (confidential client, `client_secret_basic`).                                                                                                                                                        |
| `CRON_SECRET`                   | server only | At least 16 random characters. Vercel Cron sends it as `Authorization: Bearer <CRON_SECRET>`.                                                                                                                             |

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

## Routes

| Route                                           | Who                | What                                                                                     |
| ----------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------- |
| `/`                                             | everyone           | New campaigns and categories.                                                            |
| `/campaigns`                                    | everyone           | Discovery: filter by type and category, search title and summary.                        |
| `/campaigns/[slug]`                             | everyone           | Public campaign page; the organizer and staff also see a preview before it is published. |
| `/start`                                        | signed in          | Organizer profile, then a new draft.                                                     |
| `/me/campaigns`                                 | signed in          | The organizer's campaigns.                                                               |
| `/me/campaigns/[id]`                            | the organizer      | Editor: content, milestones, cover, submit, cancel, delete draft, updates.               |
| `/admin`                                        | moderators, admins | Review queue (approve, request changes) and organizer verification.                      |
| `/api/cron/activate`                            | Vercel Cron        | Activates scheduled campaigns.                                                           |
| `/media/public/...`, `/media/private/...`       | –                  | Cover images from the private `give-media` bucket, after a visibility check.             |
| `/auth/login`, `/auth/callback`, `/auth/logout` | –                  | DOS.Me login flow.                                                                       |

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
  (refreshed first if it has expired) and the anon key. That deletes only
  this login's session and its refresh tokens; the user stays signed in to
  other DOS apps. A token without a `session_id` claim is never sent, because
  Supabase would then sign the user out everywhere. If the call fails, the
  cookies are still cleared and the failure is logged as
  `auth.logout.revoke_failed` with a reason, never a token
  (`src/lib/auth/logout.ts`).

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
