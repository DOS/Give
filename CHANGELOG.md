# Changelog

What changed on `dev`, newest first. Each line names the issue and the PR
as `#issue / #PR`, or only the PR when it had no separate issue. Merging into
`main` deploys Production at https://give.vn via Vercel (see
`docs/product-owner-config.md`, #224 / #225, #238); promotions to `main` and
the database changes that reached Production are listed under "On Production".

The schema for these changes lives in DOS/DOS.Me `supabase/migrations`.
Migrations merged into DOS.Me `dev` run on the Beta Supabase branch only;
they reach Production with a separate, approved promotion of DOS.Me `main`.

## Unreleased (dev)

### Design system and screens

- Campaign share timer and shared component tests: `ShareButtons` tracks its
  3-second clipboard status timeout in a `useRef`, clearing any pending timer
  before scheduling a new one on rapid clicks and cleaning up on unmount.
  Vitest suites cover `ShareButtons` (`navigator.share` success, `AbortError`
  cancel, non-abort clipboard fallback, rapid-click timer reset, `compact`
  mode and Facebook sharer URL encoding), `Markdown` (headings, lists,
  blockquotes, `rel="nofollow ugc noopener noreferrer"` links, raw HTML
  `<script>` escaping, `javascript:` / `data:` URL stripping and `<img>`
  disallowance), `CopyButton` and `ProgressBar` (`0%`–`100%` clamping and ARIA
  attributes) (#270 / #271).
- Active cover validation, Storage cleanup guards and lifecycle revalidations:
  `/media/public/...` and `/media/private/...` join `campaigns` on
  `cover_media_id` so superseded or orphaned draft cover uploads return `404`
  after launch, opening `dbService` lazily and adding `nosniff` and private
  `noindex, noimageindex` headers with 3-segment path bounds. `uploadCover`
  re-reads the committed `cover_media_id` before best-effort stale Storage
  deletion, `deleteDraft` guards post-commit cleanup, `cancelCampaign`
  normalizes blank reasons and maps `CANCEL_MESSAGES`, `saveOrganizer` recovers
  from `23505` insert races, and downstream `revalidatePath` coverage and route
  tests harden `submitForReview`, `cancelCampaign`, `reward-actions`,
  `fulfillment/actions` and `GET /api/cron/activate` (#258 / #267).
- Organizer campaign list, `CampaignCard`, statement preview and home ranking:
  `/me/campaigns` redirects expired or rejected JWTs (`PGRST301` / `PGRST303`)
  to `/auth/login?return_path=%2Fme%2Fcampaigns`, renders `review_note` on
  `suspended` as well as `changes_requested` rows, promotes row titles to
  `<h2>`, and appends `.sr-only` campaign titles to `"Xem trang"` and `"Quản
lý"`. `CampaignCard` guards null `display_options` and applies `mt-3` only
  when `ProgressBar` renders; `StatementPreview` and `RecentSupporters` keep
  own-transfer, returned and explained non-donation inflows out of donation
  green and supporter lists with `info` refund badges; `homeSections` ranks
  `trending` by exact progress ratio with raised-amount tie-breaking, and
  `reward-tiers` encodes `slug` in `pledgeHref` and clamps negative slots
  (#260 / #266).
- Moderation route revalidations and report queue hardening: `reportCampaign`,
  `approveCampaign`, `requestChanges`, `setVerification` and
  `moderateCampaignReports` (`suspend` and `stop_payment_requests`) revalidate
  affected `/admin`, `/admin/reports`, `/start`, `/me/*` and public
  `/campaigns/*` routes. `listCampaignReportQueue` drops campaigns resolved
  concurrently across queries and clamps `page` / `totalPages` so moderators
  never land on an empty phantom page, chunks unresolved lookups by 100
  campaign IDs, breaks resolved-report timestamp ties by `id`, and bounds
  `parseReportsPage` (#259 / #265).
- Organizer verification queue and admin moderation UX: `listOrganizersToVerify`
  loads actionable `pending` and `unverified` profiles oldest-first ahead of
  `rejected` so rejected rows never starve the `/admin#organizers` queue, and
  `listWaitingForAccount` chunks `managed_campaigns` lookups by 100 IDs.
  `/admin` hides the no-op `"Từ chối"` button on already-rejected organizers,
  confirms rejection, warns on self-verification, keeps `#organizers` buttons
  secondary (`DESIGN.md` 6), wraps review notes in `Field`, and adds `.sr-only`
  context and `#note-hint-*` `aria-describedby` wiring across `/admin` and
  `/admin/reports` (#242 / #248).
- Discovery and campaign page states and route boundaries: unfiltered
  `/campaigns` with zero live campaigns renders `"Chưa có chiến dịch nào đang
gây quỹ"` with a `/start` CTA instead of `"Không có chiến dịch nào khớp bộ
lọc"` and a self-linking `"Xoá bộ lọc"`; unknown or cross-type `category`
  query values fall back to `"Mọi danh mục"` without a ghost `"Đang lọc:"`
  strip or unchecked menu, and the phone search input sets `minLength={2}`.
  Non-public `suspended` and `cancelled` views on `/campaigns/[slug]` replace
  pre-launch preview copy in the top banner, funding box and `RewardTiers`
  with halted-status wording; `getPublicOrganizer` degrades cleanly on RPC
  failure, organizer initials extract by Unicode code point, and the funding
  `<dl>` sizes 1, 2 or 3 tracks dynamically. Whole-page `EmptyState` boundaries
  cover `/campaigns/error.tsx` and `/campaigns/[slug]/not-found.tsx`, with
  Vitest suites across all four files (#240 / #247).
- Organizer fulfillment pagination, bulk-save reset and workspace hardening:
  `/me/campaigns/[id]/fulfillment` pages 500-row batches via `page` and
  `fulfillmentHref` (`Trang trước` / `Trang sau`), resets bulk selection and
  `#bulk_note` after save via `resetOnSuccess` and keyed row controls, names
  each row's `reference_code` on `"Lưu cho người này"`, and skips tier reads
  when `!canUpdateFulfillment`. `/me/campaigns/[id]` surfaces a warning callout
  when `payments_stopped_at` is set, covers `settling`, `succeeded`, `failed`
  and `closed` in `StatusNotice`, confirms milestone deletion, and marks
  `payment_window_days` required; `RewardTiersSection` promotes tier titles to
  `<h3>` with contextual row control labels, and `/start` wires hint
  `aria-describedby` ids and `maxLength={20}` on `#phone` (#241 / #244).
- Home canonical and OpenGraph metadata and RSC tests: `/` exports canonical
  `/` and complete `openGraph` metadata (`title`, `description`, `url`,
  `siteName`, `locale`, `type`), with Vitest suites covering `HomePage`
  (empty-site vs live hero, up to three `"Đang được quan tâm"` cards, visible
  `"Hai cách gây quỹ"` discovery links, and `login_error` alert codes and
  fallback) and `FeaturedReceipt` (`give` vs `back` breakdowns,
  `other_in_amount`, missing totals fallback and `display_options` toggles)
  (#233 / #237).
- Discovery and campaign OpenGraph and indexing metadata: `/campaigns` exports
  a Vietnamese description, canonical `/campaigns` URL and complete `openGraph`
  card; `/campaigns/[slug]` emits an encoded canonical URL and complete
  `openGraph` card (with cover image when present) for public non-suspended
  campaigns, and sets `robots: { index: false, follow: false }` without
  `openGraph` or `alternates` on missing, preview and `suspended` campaigns,
  with Vitest coverage (#232 / #236).
- Campaign UI and organizer error-boundary tests: Vitest suites cover
  `ReportCampaign` (signed-in `ActionForm`, `REPORT_REASONS` options,
  `#report-details-hint` `aria-describedby` association and
  `REPORT_DETAILS_MAX`, secondary submit hierarchy, bound submission,
  signed-out encoded `return_path`, and disbursement-evidence link),
  `SummaryCells` (`<dl>` label, formatted VND figures, `data-figure` hooks and
  tones), and `/me/campaigns/error.tsx` (`MeError` alert copy, back link and
  `retry` callback); no screen change (#234 / #235).
- Campaigns cleanup: associate report-details guidance with its textarea via
  `aria-describedby`, with an optional hint id on `Field` that preserves caller
  descriptions. Correct the editor summary hint to name the campaign story,
  and document reporting, the moderator report queue and organizer fulfillment
  routes with their access guards (#228 / #229).
- Report a campaign and moderator queue: public `/campaigns/[slug]` pages offer
  a `"Báo cáo chiến dịch"` disclosure (signed-in callers submit one of six
  structured reasons and optional details, required for `"Lý do khác"`, after
  token and public-status verification; signed-out visitors get a return-path
  login prompt; hidden on previews and the organizer's own campaign).
  Moderators and admins gain the `"Báo cáo"` tab at `/admin/reports`
  (`AdminLayout`), grouping unresolved reports oldest-first by campaign with
  `ask_organizer` (`moderator_inquiry` in-app notice carrying only the
  moderator's question and a `mailto:` contact link on `/me/notices`),
  `dismiss`, `suspend` (approved/live campaigns) and `stop_payment_requests`
  (succeeded `back` projects), refusing self-review, plus recently resolved
  summaries and full error mappings in `errors.ts` (#98 / #223).
- Pledge flow tests cover the `/campaigns/[slug]/pledge` RSC's session
  routing, reward and open-pledge defaults, reference-code callout and form
  visibility, plus `PledgeForm`'s sold-out rewards, amount and minimum-hint
  updates, and conditional shipping address fields; no screen change
  (#216 / #221).
- Organizer onboarding and draft creation tests: Vitest suites cover `/start`
  session guards, profile validation and normalization, insert/update column
  boundaries, re-verification messages, funding models, slug collision retries,
  database errors and redirects, plus the StartPage RSC onboarding, collapsible
  profile, verification badges and warnings; no screen change (#208 / #222).
- Organizer campaigns, reward tiers and fulfillment tests: Vitest suites cover
  the `/me/campaigns` RSC (session and `dbAs` RLS reads, level-2 `EmptyState`
  keeping `PageHeader`'s `"Tạo chiến dịch"` as the sole primary CTA, badges,
  `privateCoverUrl` thumbnail vs `CoverPlaceholder`, `isPublicStatus` `"Xem
trang"` gating, `"Quản lý"`, and `changes_requested` review notes),
  `/me/campaigns/[id]/fulfillment` and `SelectAll` (`notFound()` guards,
  `!canUpdateFulfillment` callout without querying pledges, GET filter form and
  `"Bỏ lọc"`, filtered vs unfiltered level-2 `EmptyState`,
  `FULFILLMENT_BATCH_MAX` summary, `RefCode`, `shippingLines` `<address>`,
  per-row controls, and form-scoped `SelectAll` checkbox toggling), and
  `RewardTiersSection` (`tiers === null` danger callout, empty copy,
  `sortTiers` ordering, move/delete/edit controls and `MAX_TIERS` cap while
  editable, and `canRetireTier`, claimed notes and retired warnings in
  `RETIRABLE_STATUSES`); no screen change (#217 / #220).
- Header `Disclosure` keyboard focus and layout/admin tests: choosing a link
  inside a header `Disclosure` menu from the keyboard (`detail === 0`) gives
  focus back to its button when the panel hides, matching `Dropdown`
  (`DESIGN.md` 6); nothing changes on screen at rest. Vitest suites cover
  `Disclosure`, `CurrentTabInView`, `StickyAside` and the `/admin` review
  queue RSC (`AdminReviewPage`: session and finance/non-staff routing,
  `listWaitingForAccount` error isolation, empty states, self-review guards,
  `waitingAdvice` notes and `from_status="approved"` send-back forms, and
  organizer verification concurrency fields) (#218 / #219).
- Campaign page and editor: "Các mốc mục tiêu" and "Cập nhật" (both its list
  and its empty "Chưa có cập nhật nào." line) sit 24px below their H2 on
  `/campaigns/[slug]`, up from 16px and 8px (`DESIGN.md` 2.4). On
  `/me/campaigns/[id]` from 1024px, focused links in the "Trên trang này" side
  list draw their 2px ring 2px inside the item so adjacent items do not touch;
  `DESIGN.md` 6 names `/me/campaigns/[id]` with the side lists of `/me` and
  `/admin`. Unit tests cover `addMilestone`, `cancelCampaign` and `postUpdate`
  in `me/campaigns/actions.ts`, `RecentSupporters` and `RewardTiers`
  (#210 / #214).
- Discovery and `Dropdown` tests: Vitest suites cover `Dropdown`'s phone-sheet
  and desktop-popover focus rules (checked-item and first-link opening focus,
  `Escape`, `focusout` containment on popover vs sheet, focus return on scrim,
  "Đóng" and keyboard link activation, and outside click without stealing
  focus) and the `/campaigns` RSC (filter-bar `keep` preservation and page-1
  reset, `categoriesFor` narrowing when `type` changes, `"Đang lọc:"` chips and
  `"Xoá tất cả"`, `"Xem thêm"` and the `DISCOVERY_MAX_PAGE` hint, and the
  filtered empty state); no screen change (#209 / #213).
- Campaign page: the "Ủng hộ chiến dịch" and "Sao kê" sections keep 24px
  between their subtitle and section content, up from 16px, matching section
  rhythm while keeping 8px from the heading to the subtitle. `DESIGN.md` 2.4
  states the rule for a section heading with a one-line subtitle (#142 / #191).
- Home on phones (below 640px): the organizer band ("Bạn có một việc cần
  gây quỹ?") has 64px vertical padding, up from 48px, the gap between
  page sections of `DESIGN.md` 2.4, as it already had from 640px. On the
  campaign page, the organizer's initial tile takes the 4px radius of an
  icon tile (was 6px). `DESIGN.md` 9 widens icon tiles to include
  `surface` tiles (the bank icon boxes on `/me/accounts` and
  `/me/campaigns/[id]`, and the organizer's initial tile), 5 names
  skeletons with the 4px fills that are not panels, and 6 names
  `::before` (`hit-area`) for the tag's 44px touch target.
  `ScrollRow.test.ts` notes at the top that it also tests
  `RingBoxScroll`, and its outside-any-row test moves the row in the
  mock so a fallback to another row fails (#182 / #187).
- Home on phones (below 640px): the hero's bottom padding is 64px, up
  from 48px, the gap between page sections of `DESIGN.md` 2.4, as it
  already was from 640px. `DESIGN.md` 5 now says "Some `surface` or soft
  fills are not panels and keep 4px" and lists the filter bar's
  segmented strip with them, which 6 already gives 4px (no screen
  change). A test covers the ring-box path when a campaign card or
  reward tier is placed inside a sideways-scrolling row (no page uses
  this path yet): it is scrolled clear of the edge fade as a whole box,
  and the page's own scroll to it leaves the row where it is
  (#180 / #181).
- Home with no live campaign: the hero's one action is the primary button
  "Tạo chiến dịch của bạn"; "Khám phá chiến dịch", which led to an empty
  list, is not shown, and the empty state drops its own "Tạo chiến dịch
  đầu tiên" button. The home with campaigns is unchanged. `DESIGN.md` 8
  says so (#176 / #177).
- The organizer's "Give đã ẩn khỏi sao kê" note on the disbursements page
  takes the 6px radius of a filled notice (was 4px). `DESIGN.md` 8 states
  the home hero's split from 1024px: the text spans 8 columns and the
  receipt card the last 4. `DESIGN.md` 5 says that icon tiles and the
  hover or selected fill of a list row are not panels and keep 4px, and 9
  names every icon tile (no screen change). A campaign card or reward
  tier placed inside a row that scrolls sideways would be scrolled clear
  of the row's edge fade as a whole box (no screen has one today)
  (#175 / #177).
- Focus rings outside the shared components are whole: a control focused
  from the keyboard is scrolled clear of the sticky header, the bottom of
  the screen and, on a campaign page below 1024px, the support bar (a
  campaign card or reward tier as a whole box); the home receipt's title
  link keeps its whole ring under the two-line clamp, and its hit box is
  the two-line title block; rings show in `primary` from the first frame
  instead of fading in from the text colour; the skip link gets its 16px
  by 8px padding. Anchor jumps and mouse focus on links and buttons land
  where they did. `DESIGN.md` 6 adds "Scrolled clear" (#171 / #173).
- Empty pages, icons and the home headline: the 404, error and
  donation-not-found pages are now the whole-page empty state (the page's
  H1, balanced text), so a phone no longer leaves "công khai.", "phút." or
  "khoản đó." alone on a line. The organizer's "Giao quà" block has no
  icon. The home headline stays on two lines at 1024 to 1040px. `DESIGN.md`
  now also names the 40px cover placeholder icon and the 6px radius of
  `surface` panels such as "Hai cách" (#170 / #172).
- Discovery menus: keyboard focus never sits outside an open menu. On
  phones opening the sheet moves focus to the checked item, and Tab or
  Shift+Tab out of the sheet closes it instead of reaching the page behind
  it; the 768px popover also closes when focus leaves it; tapping the
  dimmed page or choosing an item with the keyboard gives focus back to
  the menu button. With scripting turned off a tap on the menu button
  closes the sheet (#158 / #169).
- Focus rings everywhere are whole and touch nothing: the tab ring clears
  the label's first and last letter; menu items, the sheet's "Đóng", the
  header's icon buttons and menu links and the `/me` and `/admin` side
  list draw their ring inside (on the bell, above the unread badge); footer
  links are 28px boxes centred in their 36px rows. Nothing moves at rest.
  The discovery type control's current item has a border line instead of
  a shadow on a 4px strip, and the header search field is 44px high.
  `DESIGN.md` 6 states the rule site-wide (#159 / #169).
- Home and empty states: the home headline reads in two lines
  ("Gây quỹ minh bạch, / từng đồng đều có sao kê") where it fits; an
  empty state's sentence is balanced, so a phone never leaves one word
  alone on its second line; icons larger than 24px (empty states, the
  404 and error pages, cards without a photo, the organizer's "Giao
  quà" block) keep a 1.5px line instead of a heavier one. `DESIGN.md`
  now states the empty state's padding and centring, the empty home
  hero, the "Hai cách" panels and the home's feature icons
  (#149 / #165).
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
- Manual-match candidate hint uses the net amount due after partial refunds
  for waiting pledges (read from `give.ledger_entries` under RLS, with no
  gross fallback, and never suggesting refunded donations); while a
  campaign's payment requests are stopped, older payment notices on
  `/me/notices` show neutral stop wording and a "Xem cam kết" link
  (#93 / #185).

### Money (M1)

- First bank statement parser: Techcombank Business transaction export,
  CSV or XLSX (`tcb-business`, decision P3 of 2026-11-18). Built
  from Techcombank's public guides with synthetic fixtures; the export's
  table header and both format flags stay unconfirmed until JOY's
  anonymized samples arrive. `hasRunningBalance` is set and checked on
  every file (opening and closing balances required, every row's balance
  must follow from the one before), `hasStableRowId` is not. Shared
  spreadsheet reading in `statement-parsers/sheet`: XLSX unpacked under a
  32 MB inflate cap, its sheet XML checked (at most 20,000 rows and 100
  columns, no text-date or error cells) and rebuilt before the
  `read-excel-file` package reads it; CSV in-house. P3 marked decided in
  the design doc. ACB research is kept in
  `docs/research/bank-statements.md` 6.1; no ACB parser yet (#17 / #231).
- Refusal reasons on `/admin/unmatched`: each transaction under "Tiền vào
  không thuộc chiến dịch nào" shows why it was not given to a campaign
  ("Tài khoản nhận không thuộc người tổ chức chiến dịch", or "Chiến dịch đã
  đóng khi tiền về") with a link to that campaign, read with the staff
  member's token through `give.bank_transaction_refusal_reasons`
  (`refusalReasons` in `lib/reconciliation.ts`). Without the function (an
  environment before DOS/DOS.Me#1757) or on a read error the rows show no
  reason and the page no error (#138 / #230).
- Follow-ups from #64 (`apps/web`): `approveCampaign` and `requestChanges`
  report a failed campaign pre-read instead of "not found";
  `checkSubmitAccount`, `loadEditorAccounts` and `/me/campaigns/[id]` load
  editable bindings' transaction history and gate swap guidance on
  `canAskSwap` so only sent-back `give` campaigns are pointed to the
  finance-approved account swap while drafts and `back` campaigns with
  recorded transactions hide early release and direct the organizer to
  contact Give; tests cover `checkSubmitAccount`, `loadEditorAccounts`,
  `submitForReview`, `/me/campaigns/[id]` and the non-owned binding
  fallback of `openingBlock` (#77 / #190).
- An admin can send an explanation of incoming money as "không phải tiền
  ủng hộ" back to unmatched: "Đưa về chưa khớp" on each item of "Đã giải
  trình gần đây" on `/admin/unmatched`, with a required private reason (up to
  1000 characters), for money that turns out to be a donation whose
  contribution is not known yet. The form says that afterwards the money can
  be matched to a contribution but is never explained as "không phải tiền
  ủng hộ" again. It is not offered to finance staff, and an admin who
  organizes the campaign or made the explanation, or a transaction whose
  account binding is released, gets the reason instead of the form; a
  corrected or returned explanation offers nothing. Returned money shows again
  under "Chờ khớp" on `/admin/unmatched` and on the organizer's
  `/me/campaigns/[id]/unmatched`, with a note naming the old kind (and, on
  `/admin/unmatched` only, the admin's private reason), and is matched there
  (pick or reference code); the explain and
  returned-transfer forms are left out for it, and the correction button is
  hidden for a returned explanation. Every refusal of
  `give.return_inbound_to_unmatched` and `GIVE_EXPLANATION_RETURNED` from the
  explain and correct actions are worded. The reconciliation audit on
  `/admin/statements` now also lists corrections (#71) and returns of an
  explanation (#196).
- Guest donation tracking link across devices: a guest holding a valid status
  token on `/donations/[code]` can copy a reusable `/donations/[code]/track`
  link; opening it on another browser or device validates the token in
  constant time, sets the httpOnly `__Host-` status cookie and `303`-redirects
  to the clean `/donations/[code]` URL without personal data or `Referer`
  leakage (#50 / #186).
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
- Unmatched queues: a transaction whose receiving account is not owned by
  the campaign's organizer shows why it cannot be matched instead of a match
  form; `/admin/unmatched` lists incoming money that belongs to no campaign
  (read only); the "no campaign" message names every cause (#148 / #164).
- Money a bank returned from a transfer out (a bounced payment or refund):
  finance staff link it on `/admin/unmatched` to the explained outgoing
  transaction it came from, with a private reason and evidence
  (`give.link_returned_transfer`). The row leaves the unmatched queues; the
  campaign's spent or refunded total and "đã thanh toán" drop by the returned
  amount (for a refund, the refunded total drops by the original amount since
  #195); a refunded pledge is owed a refund again and both people get a
  notice. The public statement shows both rows as a returned transfer
  ("Tiền chuyển đi bị trả lại"), with the other row's amount and day and no
  personal data (#72 / #193).
- A bank fee kept on a returned refund is the organizer's to bear, and the
  backer is owed the full refund again (owner decision). The organizer's
  `refund_owed` notice says the bank kept a fee and asks to send the full
  amount again; the backer's `refund_due` notice says they still get it in
  full. On `/me/campaigns/[id]/disbursements` an explained transfer that a
  bank returned shows what came back, the fee, and for a refund the full
  amount to send again. The public statement and its preview show the fee
  as a bank fee in "đã chi" on the returned pair, once per pair, never as
  money that reached the backer; `/admin/unmatched` shows it on each
  returned transfer and in the link message (#195).
- `/me/campaigns/[id]/disbursements`: a transfer out that finance linked as
  returned by the bank but that has no explanation is listed under its own
  "Bị ngân hàng trả lại" heading with the return day, is never offered to
  explain and does not count under this page's "Chưa giải trình"; the
  explain action refuses it. The database already links only explained
  transfers, so this is a guard (#194).
- Correcting a mistaken explanation of incoming money: on `/admin/unmatched`,
  an admin (not finance, and never the campaign's organizer, the person who
  explained it or the contributor) can correct an item of "Đã giải trình gần
  đây" with "Sửa giải trình": pick a contribution of the same campaign and
  give a required reason (`give.correct_inbound_explanation`). The money moves
  from "không phải tiền ủng hộ" to that contribution once; "đã thanh toán"
  does not move. A corrected item shows its correction and cannot be
  corrected again. The app reads a corrected transaction as matched, not
  explained, and the public statement shows it as a donation only
  (#71 / #198).
- Statement reconciliation (`/admin/statements`): finance staff can resolve
  a statement row of a dismissed upload (`event_dismissed`: a test file, a
  statement uploaded to the wrong account) as "Không phải giao dịch thật"
  with a required note, recording no bank transaction;
  `/me/statements/[batchId]` counts and badges those rows. A queued row whose
  earlier look-alike was resolved that way no longer shows or preselects it,
  and imports without the "different transaction" confirmation. Staff who
  own the account, or organize a campaign it is or was bound to for the
  row's date, see a notice instead of the forms (the database refuses them
  with `GIVE_SELF_REVIEW`, for every resolution). Every refusal of the
  resolution is worded in Vietnamese (#78 / #200, takes over #189).
- Nobody settles money to their own contribution, signed in or as a guest
  with their own email: the match list (`/admin/unmatched`,
  `/me/campaigns/[id]/unmatched`), the correction list, the refund picker
  (`/me/campaigns/[id]/disbursements`) and the returned-refund list leave out
  the viewer's own contributions. `guest_email` is read only with the
  viewer's own token and only to filter; it never reaches a page. Each of
  the four actions words the database's `GIVE_SELF_REVIEW` for its context
  (the generic text was about receiving accounts), and the organizer's
  unmatched page states the rule: their own contribution matches by
  reference code, or Give's finance staff match it (#199 / #202).
- Finance and admin staff record a campaign's transfer out as a refund to a
  chosen contribution on the new admin tab "Hoàn tiền" (`/admin/refunds`,
  campaigns with transfers out still to explain, longest waiting first, then
  `/admin/refunds/[id]`). It is the path for a refund to the organizer's own
  contribution, which the organizer cannot book since #199. Only refunds;
  the same list rules as the organizer's page (no move between the
  campaign's own accounts, transfers the bank returned shown apart and not
  offered), the organizer form's validation and evidence upload (now in
  `lib/disbursement-evidence.ts`), and a picker without the staff member's
  own contributions or those with less left to refund than the transfer.
  The role is checked with the staff member's own token first. The
  organizer's refund refusal and hint now tell them to ask Give's finance
  staff, who record it as a refund (#203 / #204).

### Platform

- Contact: Give staff are reached at `hi@give.vn` (Give's own domain; it
  replaced the first choice, DOS.Me's `help@dos.me`), kept in one constant
  (`apps/web/src/lib/contact.ts`). The site footer shows
  "Liên hệ: hi@give.vn" under the brand line, and every
  organizer-facing message that asks the reader to contact Give (refusals,
  upload errors, account and status notices, the refund hint) names the
  address as a `mailto:` link. Staff-facing messages still point at another
  staff member (#205 / #215).
- Admin page to grant and revoke Give staff roles (#43).
- Auth: the session ends only on a dead refresh token; the refresh call is
  bounded (#51).
- Dependabot opens its PRs against `dev` (#117); dependency bumps (#109,
  #114, #116, #118).
- `tailwindcss` and `@tailwindcss/postcss` 4.3.5, moved onto `dev` from
  Dependabot's #160 and #162, which it opened against `main`; nothing
  changes on screen (#163 / #166).
- `next` 16.4.6 and `eslint` 10.14.0, packaged onto `dev` from Dependabot's
  #179 and #178; nothing changes on screen (#183 / #184).

### Database (DOS.Me)

- Finance can read why a bank transaction was refused:
  `give.bank_transaction_refusal_reasons(uuid[])`, finance and admin only,
  returns the `bank_transaction.account_owner_mismatch` and
  `bank_transaction.after_close` audit entries of the given transactions with
  their campaign and binding; every other `give.audit_log` entry stays
  admin-only (#138 / DOS/DOS.Me#1757). Migration
  `20261121160000_give_bank_transaction_refusal_reasons`.
- Staff lock on the owner-or-staff RPC paths: a role change and the
  owner-or-staff actions no longer race (#120 / DOS/DOS.Me#1652). Migration
  `20261112060000_give_owner_or_staff_role_revoke_lock`.
- Reconciliation checks the account owner: an inbound or outbound bank
  transaction is not attributed to, or matched on, a campaign whose organizer
  does not own the receiving account (#119 / DOS/DOS.Me#1662). Migration
  `20261112090000_give_reconciliation_account_owner`.
- Returned transfers: `give.returned_transfers`, `give.link_returned_transfer`
  and three `give.public_statement` columns (`return_of`, `returned_by`,
  `returned_at`) (#72 / DOS/DOS.Me#1680, on Beta). Migration
  `20261115150000_give_returned_transfers`. The Give app's #72 change reads
  them, so it needs this migration on Production before it is released.
- Bank fee on a returned refund: a linked refund is reversed in full and the
  fee is booked as spent; `give.public_statement` gains `return_bank_fee`
  (#195 / DOS/DOS.Me#1683, on Beta). Migration
  `20261115170000_give_returned_refund_bank_fee`. The Give app's #195 change
  reads the column, so it needs this migration on Production before it is
  released.
- Corrections of explanations: `give.inbound_explanation_corrections`,
  `give.correct_inbound_explanation`, and `give.public_statement` hides the
  kind of a corrected explanation (#71 / DOS/DOS.Me#1682, on Beta). Migration
  `20261116090000_give_correct_inbound_explanation`. The Give app's #71
  change reads the new table, so it needs this migration on Production
  before it is released.
- Statement-row `not_a_transaction` resolution:
  `give.resolve_statement_import_row` accepts `not_a_transaction` for
  `event_dismissed` rows that no active duplicate stands for, writes the
  audit row without a bank transaction, and refuses every resolution by
  the account's owner or the organizer of a campaign bound to it for the
  row's date (`GIVE_SELF_REVIEW`); staging never pairs a new row with a
  voided one, and a voided row no longer keeps `give.release_account_binding`
  waiting (#78 / DOS/DOS.Me#1684, on Beta). Migration
  `20261116120000_give_statement_row_not_a_transaction`. The Give app's #78
  change calls it, so it needs this migration on Production before it is
  released.
- Own guest contributions in the self-review rule: `give.is_own_contribution`
  (signed in, or a guest email equal to the actor's auth email after trim and
  lowercase), checked by `give.correct_inbound_explanation`,
  `give.match_transaction` (manual), `give.record_disbursement` (refund) and
  `give.link_returned_transfer` (returned refund) with `GIVE_SELF_REVIEW`; the
  last three also newly refuse the actor's own signed-in contribution
  (#199 / DOS/DOS.Me#1687, on Beta). Migration
  `20261116150000_give_self_review_guest_contribution`.
- Returning a mistaken explanation to unmatched:
  `give.inbound_explanation_returns` and `give.return_inbound_to_unmatched`
  (admin only, `GIVE_SELF_REVIEW` for the organizer and the explainer, once per
  transaction, refused once corrected or on a released binding). The money
  moves from `other_in` back to `unmatched_in`, totals unchanged; afterwards it
  is matched, never explained, corrected or linked as a returned transfer
  again (#196 / DOS/DOS.Me#1692, on Beta). Migration
  `20261117090000_give_return_inbound_to_unmatched`.
- Campaign reports and moderator queue: `give.campaign_reports` (RLS for
  moderator/admin with column grants omitting `reporter_id` and `handled_by`),
  `give.report_campaign` (20-per-24h serialized limit, idempotent while
  unresolved), `give.moderate_campaign_reports` (`dismiss`, `ask_organizer`,
  `suspend` mirroring `give.transition_campaign`, and `stop_payment_requests`),
  and the `moderator_inquiry` notice kind (#207 / DOS/DOS.Me#1722, on Beta).
  Migration `20261120090000_give_campaign_reports`.

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

### On Production (2026-11-17)

Promoted with JOY's approval. Database first: the selective promotion
DOS/DOS.Me#1742 (merge commit `d6732a30`) applied `20261115120000` (#84),
`20261115150000` (#72), `20261115170000` (#195), `20261116090000` (#71),
`20261116120000` (#78), `20261116150000` (#199), `20261117090000` (#196) and
`20261120090000` (#207), plus the CI fix of #174. Then Give `main` took `dev`
through #224 (merge commit `84e42a23`), which deploys give.vn on Vercel. The
test-only #135 and #144 changes reached DOS.Me `main` earlier (#155,
DOS/DOS.Me#1673).
