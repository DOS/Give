# Changelog

What changed on `dev`, newest first. Each line names the issue and the PR
as `#issue / #PR`, or only the PR when it had no separate issue. `main` has no Production deploy yet (see
`docs/product-owner-config.md`), so no app change below is released; the
database changes that reached Production are listed under "On Production".

The schema for these changes lives in DOS/DOS.Me `supabase/migrations`.
Migrations merged into DOS.Me `dev` run on the Beta Supabase branch only;
they reach Production with a separate, approved promotion of DOS.Me `main`.

## Unreleased (dev)

### Design system and screens

- Discovery menus: while a menu is open, keyboard focus stays in it. On
  phones opening the sheet moves focus to the checked item, and Tab or
  Shift+Tab out of the sheet closes it instead of reaching the page behind
  it; the 768px popover also closes when focus leaves it, and tapping the
  dimmed page gives focus back to the menu button (#158 / #169).
- Focus rings everywhere are whole and touch nothing: the tab ring clears
  the label's first and last letter, menu items, the sheet's "Đóng" and the
  header's icon buttons draw their ring inside, and footer links are 28px
  boxes centred in their 36px rows, so nothing moves. The discovery type
  control's current item has a border line instead of a shadow on a 4px
  strip, and the header search field is 44px high. `DESIGN.md` 6 states
  the rule site-wide (#159 / #169).
- Discovery on phones: moving keyboard focus inside an open menu sheet
  ("Danh mục", "Trạng thái", "Sắp xếp") no longer scrolls the filter bar
  behind it (#152 / #156).
- Focus rings: the discovery type control draws its ring inside the item,
  so it no longer touches the next item or the strip's edge; an item
  reached by keyboard in a filter row is scrolled clear of the edge fade
  together with its ring; with scripting turned off the filter and tab
  rows show no edge fade, so nothing hides the last item or its ring.
  `DESIGN.md` 6 now states the focus ring and its exceptions
  (#153 / #156).
- Statement: the filter tag row fades at the edge with more tags at any
  width when it does not fit, not only on phones; with today's labels
  nothing changes on screen (#154 / #156).
- Filter rows: the keyboard focus ring is no longer cut off at the edge of
  a row that scrolls sideways: the first and last tag of the statement
  filters, and the menu buttons of the discovery filter bar below 768px.
  Nothing moves at rest (#150 / #151).
- Tag: an interactive tag takes its invisible 44px touch target from the
  shared `hit-area` utility instead of its own classes; nothing changes on
  screen (#141 / #146).
- Home: with no campaign raising funds, the empty state sits at the
  section distance from the hero and from "Hai cách gây quỹ" (64px, 96px
  from 1024px) instead of 112px and 144px. Other empty states keep their
  48px padding (#143 / #147).
- Tabs: a tab row that does not fit and scrolls sideways (`/me`, `/admin`,
  the campaign and statement pages) fades at the edge that has more tabs;
  no fade where the row fits. A tab reached by keyboard is scrolled clear
  of the fade (#124 / #140).
- Home: the cards sit 24px under the "Đang được quan tâm" heading row
  (under the wrapped link below 375px). The "Xem tất cả" link is one line
  of text with an invisible 44px touch target (`hit-area`); the campaign
  page's "Sao kê" header gets the same fix (#131 / #139).
- Home: with no campaign raising funds, the empty-state title is an H2, so
  the outline does not skip a level (#134 / #139).
- Discovery follow-ups: the empty-state title is a real heading (H3 under a
  section, H2 directly under the page title; the home page follows in
  #134); `DESIGN.md` states the menu breakpoint as "below 768px a sheet,
  from 768px a popover", which the menus already did; migration version in
  two code comments (#128 / #133).
- `DESIGN.md` rule for reference codes: `RefCode` and `MachineId`
  components, the monospace stack, sizes and the copy button. Screens show
  payment and statement codes through them (#123 / #130).
- Home: the "Đang được quan tâm" heading stays on one line on phones
  (#126 / #129).
- Discovery: status filter, sort and "Xem thêm" paging (#107 / #127).
  Needs DOS.Me migration `20261111173000_give_discover_campaigns`.
- Campaign cards: organizer name and a verified check (#106 / #125).
  Needs DOS.Me migration `20261111120000_give_public_campaign_organizers`.
- Redesign on `DESIGN.md`: tokens, layout, header and footer, home,
  discovery, the campaign page (#103 / #105), then the donate, pledge and
  payment flows, `/me` and `/admin` (#104 / #122). `DESIGN.md` added (#102).
- Earlier UI pass on the design kit: foundation (#97), donate, pledge and
  payment pages (#99), `/me` (#100), admin screens (#101).

### Back campaigns (M3)

- Pledge flow, payment page, reminders and lapse (#31 / #88).
- Editor: reward tiers and fulfillment updates (#83 / #87); account section
  and submit guard (#85 / #90).
- Stop on payment requests; refunds counted net of partial refunds
  (#89 / #91).

### Money (M1)

- Donate flow with VietQR and a guest status page (#44).
- Payment channel interface and statement-import pipeline (#16 / #61);
  statement upload, ambiguous-row queue and manual matching (#20 / #62);
  large uploads in parts and a staff page for parked inbound events
  (#73 / #76).
- Public statement page, money totals and disbursement explanations (#54);
  public evidence, donor display names and the gross headline (#58 / #67).
- Receiving accounts: bound in the editor and required before review
  (#32 / #65); explained on submit and approval (#38 / #63); payment
  details read from `give.payment_account` (#48 / #79); replacing a disabled
  account on a live campaign (#55 / #81); an admin queue for approved
  campaigns waiting for one (#64 / #75).
- Cron jobs: finalize-ended and reprocess-inbound (#22 / #59), bounded
  inbound retries and per-campaign finalize results (#60 / #70), in-app
  notices and the remind-unexplained job (#52, #22 / #66).
- Unmatched incoming money that is not a donation is explained (#49 / #69);
  disbursements and the statement queue read the database's replay flag
  (#56 / #74); guest donation creation is rate-limited (#47 / #68).
- Manual match: a clear message when the receiving account does not belong
  to the campaign's organizer, instead of the generic database error
  (#136 / #145).

### Platform

- Admin page to grant and revoke Give staff roles (#43).
- Auth: the session ends only on a dead refresh token; the refresh call is
  bounded (#51).
- Dependabot opens its PRs against `dev` (#117); dependency bumps (#109,
  #114, #116, #118).

### Database (DOS.Me)

- Staff lock on the owner-or-staff RPC paths: a role change and the
  owner-or-staff actions no longer race (#120 / DOS/DOS.Me#1652). Migration
  `20261112060000_give_owner_or_staff_role_revoke_lock`.
- Reconciliation checks the account owner: an inbound or outbound bank
  transaction is not attributed to, or matched on, a campaign whose organizer
  does not own the receiving account (#119 / DOS/DOS.Me#1662). Migration
  `20261112090000_give_reconciliation_account_owner`.

### On Production (database only)

Promoted to DOS.Me `main` on 2026-11-13 with JOY's approval, by the selective
promotion DOS/DOS.Me#1666 (merge commit `dcd67080`; runbook
`docs/superpowers/runbooks/give-promotion-2026-11.md` in DOS/DOS.Me):
`20261111120000` (#106), `20261111173000` (#107), `20261112060000` (#120) and
`20261112090000` (#119). Function definitions only; the Give app itself still
has no Production deploy. Behaviour to know:

- Deleting an admin account during a role change fails fast with
  `GIVE_ACCOUNT_DELETION_BUSY`; retry it.
- A rare owner-moderator cancel race fails closed.
- A bank transaction on an account the campaign's organizer does not own is
  recorded unattributed, and a manual match on it is refused with
  `GIVE_ACCOUNT_OWNER_MISMATCH` (#119; follow-ups #137, #138).

### Waiting for Production

- The test-only changes #135 / DOS/DOS.Me#1663 and #144 / DOS/DOS.Me#1664 are
  on DOS.Me `dev` and are to be promoted together (#155). Until then DOS.Me
  `main` carries `give_staff_role_revoke_lock.test.sql` with the known test
  defect of #135; no CI job runs it.
