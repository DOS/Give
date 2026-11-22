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

- Atomic moderator status-transition race guard and pre-launch recovery queue:
  `apps/web/src/app/admin/actions.ts` passes `p_expected_status` on
  `approveCampaign` (`in_review` -> `approved`, `approved` -> `live`) and
  `requestChanges` (`in_review`, `approved`, `suspended`) and maps
  `GIVE_CAMPAIGN_STATUS_CHANGED` (`40001`) and `suspended -> changes_requested`
  refusals in `apps/web/src/lib/errors.ts`; `/admin` adds the `#recovery`
  (`"Cần xử lý trước khi mở"`) section backed by
  `give.campaigns_needing_recovery()` (`listCampaignsNeedingRecovery`,
  `recoveryAdvice`) so moderators can see and recover approved campaigns past
  `ends_at` with usable accounts and campaigns suspended before `starts_at`
  (never live, no contributions), with unit and RSC Vitest coverage, backed by
  `DOS/DOS.Me#1872` (#77 / #306).
- Co-organizers (campaign editors), single-use invites, workspace guards and
  public team block: `/me/campaigns/[id]?tab=team` (`TeamTab`,
  `CreateInviteForm`, `member-actions.ts`) lets the owning organizer create
  single-use expiring invite links (raw 64-char hex token shown once on
  creation, never logged or re-displayed), revoke pending invites and remove
  accepted editors, while explicitly keeping money, receiving accounts,
  statements, refunds, fulfillment, monthly plans, analytics, lifecycle
  transitions and team management owner-only (`notFound()` for editors/staff).
  `/invites/[token]` sets `Referrer-Policy: no-referrer`,
  `Cache-Control: private, no-store` and `X-Robots-Tag: noindex, nofollow`,
  prompts guests to sign in without leaking draft titles or touching
  `dbService()`, and previews/accepts pending invites via `dbAs(token)` with
  already-member shortcuts. `/me/campaigns` lists both owned and accepted
  editor campaigns (badged `"Đồng tổ chức"`), `/me/campaigns/[id]` lets
  accepted editors manage content, cover, YouTube pitch video, milestones,
  reward tiers and own updates under strict server guards, and public
  `/campaigns/[slug]` pages render `CampaignTeam` (`"Đội ngũ tổ chức"`) when
  a campaign has accepted editors, backed by `DOS/Give#264` (`DOS/DOS.Me#1856`)
  with Vitest suites (#253 / #298).
- Public organizer profile page and `/me` handle/bio editor: `/u/[handle]`
  renders public organizer profiles (`handle`, `bio`, `OrganizerAvatar` with
  safe `https://` validation and 4px-radius initials fallback, verification
  badge and public campaigns with ledger totals) strictly through anonymous
  `dbAs()` calls to `give.public_organizer_profile` and
  `give.list_organizer_public_campaigns`. `/me` (`PublicProfileForm`,
  `actions.ts`, wired into `MePage` and `SiteHeader`) lets signed-in organizers
  edit only `(handle, bio)` with live `give.vn/u/<handle>` URL preview,
  3–40-char regex and 96-word reserved-handle validation matching
  `DOS/Give#261` (`DOS/DOS.Me#1851`), Vietnamese error mappings and preserved
  `verification_status`, while `/campaigns/[slug]` and `CampaignCard` link the
  organizer name to `/u/<handle>` when set, with Vitest suites (#251 / #297).
- Campaign comments with one reply level, moderation and comment reports queue:
  public `/campaigns/[slug]` pages add the `#binh-luan` tab and
  `CampaignComments` (plain-text comments and 1-level replies with newest roots
  first and oldest replies first, `"Người tổ chức"` badge, `"(đã chỉnh sửa)"`
  indicator, deleted-account neutral fallback, `?comments_page=` pagination,
  authenticated post/reply/edit/delete/report, organizer hide, and staff
  `?show_hidden=1` inline moderation with self-review guards via `dbAs(token)`).
  `/admin/reports` gains a `TabNav` (`"Báo cáo chiến dịch"` / `"Báo cáo bình
luận"`) leading to `/admin/reports/comments` with status/campaign filters,
  `list_comment_moderation_history` audit disclosure and deleted-comment
  snapshot handling, backed by `DOS/Give#262` (`DOS/DOS.Me#1853`) with Vitest
  suites (#250 / #296).
- Organizer campaign analytics and `Thống kê` tab: `POST /api/analytics/event`
  (excluded from `proxy.ts` session rotation) validates same-origin /
  `Sec-Fetch-Site`, enforces JSON/size bounds, silently filters bot User-Agents
  while allowing Zalo/Facebook in-app browsers and Cốc Cốc, applies ephemeral
  HMAC-hashed rate limiting, strips referrer paths/queries and normalizes
  same-origin hosts to `null`, and calls `dbService().rpc("record_campaign_event")`.
  `CampaignViewBeacon` deduplicates views to once per campaign per Vietnam
  calendar day per browser (`sendBeacon` with `keepalive` `fetch` fallback,
  suppressed on previews/prerenders) and `ShareButtons` records `share_click`
  events. `/me/campaigns/[id]?tab=analytics` (`AnalyticsTab`, `TabNav` and
  7/30/90-day `SegmentedNav`) reads `give.get_campaign_analytics` via
  `dbAs(token)` to render KPIs, daily views trend, responsive breakdown and
  referrer bars, backed by `DOS/Give#263` (`DOS/DOS.Me#1852`) with Vitest
  suites (#252 / #295).
- Organizer campaign status and review history: `/me/campaigns/[id]` loads
  `listStatusEventsByCampaign(db, [campaign.id])` inside `Promise.all` with
  `.catch(() => new Map())` resilience and renders `<StatusHistory>` inside
  `#status` (`"Trạng thái"`), replacing `"Không có thao tác nào ở trạng thái
này."` on non-actionable statuses while sitting cleanly above `"Gửi duyệt"`
  and `"Hủy chiến dịch"` when status actions are available, with RSC Vitest
  coverage for rendered transitions and failed `campaign_status_events` reads
  (#287 / #288).
- Organizer draft campaign updates workflow: `/me/campaigns/[id]` extends
  `postUpdate` with `intent = "draft" | "publish"` (preserving immediate
  publish when `intent` is omitted, inserting `published_at: null` across all
  `canPostUpdate` statuses, and gating immediate publish to approved and
  public statuses) and adds `updateDraftUpdate`, `publishDraftUpdate` and
  `deleteDraftUpdate` strictly scoped to `.is("published_at", null)` with
  organizer and public route revalidations. `#updates` lets organizers prepare,
  inline-edit (`<details>` `"Sửa bản nháp"`) and delete drafts before
  approval, places secondary `"Lưu bản nháp"` ahead of primary `"Đăng công
khai"` once publishable, badges unpublished rows (`Bản nháp`) separately
  from permanent published dates (`Đã đăng`), and guards publish and delete
  actions with `confirm` dialogs, with Vitest suites (#281 / #286).
- Campaign `BreadcrumbList` JSON-LD structured data: public non-preview,
  non-halted `/campaigns/[slug]` views emit a `schema.org` `BreadcrumbList`
  `<script type="application/ld+json">` matching the breadcrumb trail (`Trang
chủ` -> `Khám phá` -> `Từ thiện` / `Dự án sáng tạo` -> optional
  `campaign.category` -> `campaign.title`, resolving absolute `item` URLs
  against `siteOrigin()` when configured and omitting `item` on the final
  current-page `ListItem`), serialized with `.replace(/</g, "\\u003c")` so
  `</script>` or `<!--` in campaign text cannot break out of the script tag, and
  suppressed on `preview`, `suspended` and `cancelled` views, with Vitest
  coverage (#283 / #285).
- Admin campaign status and review history disclosure: `StatusHistory` and
  `listStatusEventsByCampaign` batch-query `give.campaign_status_events` in
  100-campaign chunks ordered newest-first without selecting `actor_id`,
  rendering a compact `<details>` timeline (`Lịch sử trạng thái (N)` with
  `.sr-only` campaign context, `STATUS_LABELS` transitions, Vietnam
  timestamps and `whitespace-pre-line` review reasons). `/admin` (`#queue`
  and `#waiting`) and `/admin/reports` (`#unresolved`, with `campaign_id`
  fallback) load status history with `.catch(() => new Map())` resilience so
  transient read errors never block moderation queues, with Vitest suites
  (#282 / #284).
- Organizer YouTube pitch video editor and inline milestone editing:
  `/me/campaigns/[id]` adds a `#pitch-video` (`"Video giới thiệu"`) panel
  (`saveYoutubeVideo` and `removeYoutubeVideo` validating `youtu.be`,
  `youtube.com` `watch` / `shorts` / `embed`, `youtube-nocookie.com/embed` and
  11-character IDs, inserting `kind = 'youtube'` in `give.campaign_media` and
  deleting only older YouTube rows with rollback on cleanup failure while
  leaving cover images untouched, plus isolated section degradation on read
  failure) and extends milestones with optional `unlock_note` (`<= 500` chars)
  and contextual inline `<details>` `"Sửa mốc"` editing (`updateMilestone`)
  while editable, with Vitest suites (#269 / #274).
- Public campaign pitch video player and milestone completion states:
  `/campaigns/[slug]` renders `CampaignVideo` for valid 11-character
  `kind = 'youtube'` media rows (a zero-tracker click-to-play `16:9` poster
  card proxying `i.ytimg.com` via `next/image` with a secondary `min-h-11` play
  button and `"Mở trên YouTube"` fallback that mounts
  `youtube-nocookie.com/embed` only on click, degrading cleanly on media query
  errors) and `MilestoneList` (`"Đã đạt mốc"` `brand` badge and `unlock_note`
  disclosure once ledger-derived `raisedAmount >= target_amount`, or
  `"Khi đạt mốc:"` preview copy without reached badges on unpublished
  previews), with Vitest suites (#268 / #272).
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
  swaps `cover_media_id` via optimistic compare-and-swap (CAS) and best-effort
  deletes only the exact replaced cover row and Storage object, `deleteDraft`
  guards post-commit cleanup, `cancelCampaign` normalizes blank reasons and
  maps `CANCEL_MESSAGES`, `saveOrganizer` recovers from `23505` insert races,
  and downstream `revalidatePath` coverage and route tests harden
  `submitForReview`, `cancelCampaign`, `reward-actions`, `fulfillment/actions`
  and `GET /api/cron/activate` (#258 / #267).
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

- Finance-approved receiving-account swap for `back` campaigns and
  `payment_due` pledge notifications: extends `canAskSwap`, `approvalBlock`,
  `loadEditorAccounts`, `checkSubmitAccount`, `requestAccountSwap`,
  `/me/campaigns/[id]` (`ReceivingAccountSection` / `AccountSwapBlock`),
  `/admin/account-swaps`, `/admin` `recoveryAdvice` and `lib/errors.ts` to
  support finance-approved receiving-account swaps on `back` campaigns in
  `live`, `suspended`, `changes_requested` (with recorded transactions;
  zero-transaction bindings still direct to early release) and `succeeded`
  when pledges still have payments due (`campaignHasPaymentsDue` /
  `campaignsWithPaymentsDue`), while strictly preserving `#264` owner-only
  money boundaries so co-organizers never view or submit swap requests. Adds
  the `payment_account_changed` in-app notice (`lib/notices.ts`, wired into
  `asksForPayment` so `stoppedNoticeCampaigns` suppresses payment CTAs while
  payment requests are stopped) and the `pledge_account_swapped` transactional
  email template (`server/email/templates.ts`, `lib/email-outbox.ts` 14-day
  max age, live net amount due, deadline, `/me/pledges/[code]` CTA, no
  unsubscribe/stop links), sharing strict anti-leak masking helpers
  (`maskedAccountLast4`, `swappedNewAccountLine`, `swappedOldAccountTarget`)
  so raw account numbers never leak, backed by `DOS/DOS.Me#1873` with Vitest
  suites (#92 / #310).
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

- Monthly donations (plan A) follow-ups from `#290`: adds the deduplicated,
  bounded-concurrency `paymentAccounts()` helper (max 5 in flight,
  per-campaign error isolation) in `apps/web/src/server/contributions/index.ts`,
  skips `give.payment_account` RPCs on `/me/contributions` for ended plans or
  plans without a potentially payable current-month donation (sharing
  `currentPlanDonation()` with `PlanList` and `vnMonthStart` in
  `lib/plans.ts`), runs usable-account and pledge-balance lookups in parallel
  with one consistent clock, and fixes the misplaced `ContributionList` JSDoc
  block. Hardens `apps/web/src/server/plans/jobs.ts`,
  `GET /api/cron/issue-plan-donations` and `GET /api/cron/plan-notices` to
  isolate Step 1 and Step 2 within the shared 45 s budget (still returning
  HTTP 500 on step failure), drain multi-batch `expire_plan_donations`
  (500 rows/batch) with per-batch error isolation and budget-guarded
  stalled-batch detection (`expire_stalled: true`, `done: false`), and emit
  structured zero-PII JSON error logs (`plan_cron.failed_outcomes`,
  `plan_job.plan_failed`, `plan_job.expire_batch_stalled`,
  `plan_job.expire_batch_failed`, `plan_cron.step_failed`) on `'failed'`
  outcomes or step/batch errors, with Vitest coverage (#308 / #309).
- Monthly plan donor notifications on receiving-account swap: adds the
  `plan_account_swapped` email template (`apps/web/src/server/email/templates.ts`)
  and admin outbox metadata (`apps/web/src/lib/email-outbox.ts`:
  `OUTBOX_KIND_LABELS.plan_account_swapped`, `OUTBOX_SKIP_LABELS.plan_not_active`,
  `OUTBOX_SKIP_LABELS.account_superseded`, and 14-day `outboxMaxAgeDays`).
  Notifies active monthly plan donors when a campaign's receiving account is
  replaced, showing Vietnam-time swap date, new account holder name, bank
  short name or crypto chain, and strictly validated masked last 4 digits only
  (`•••• XXXX`, never raw account numbers), warning donors to delete saved
  bank transfer templates for the old account, requiring both a signed
  one-click plan stop link (`/plans/stop?t=...` and RFC 8058
  `List-Unsubscribe`) and notification unsubscribe link
  (`/email/unsubscribe?t=...`), and generalizing non-summary unsubscribe copy,
  backed by `DOS/DOS.Me#1871` with Vitest suites (#291 / #307).
- Monthly donations, plan A (D9): a signed-in donor signs up on a give
  campaign that allows it (amount, day 1–28, reminder consent, the
  anonymity warning that a transparent account's statement shows the name
  every month) and Give issues an ordinary donation with its own code and
  VietQR each month; nothing is charged. The organizer turns it on or off in
  the workspace (only with an end date; off ends every plan) and sees the
  monthly supporters' display names. `/me/contributions` lists plans with
  this month's QR, edit and stop; a plan donation's QR shows while the
  campaign is live, before its end and inside its month. Reminder emails
  carry a signed stop link (`/plans/stop` asks first; POST and RFC 8058
  one-click stop the plan) and `List-Unsubscribe`; end notices name the
  account to delete from saved templates. Crons `issue-plan-donations`
  (hourly) and `plan-notices` (every 10 minutes) sweep one plan per call
  (#276 / this PR, needs DOS/DOS.Me#1824).
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

- Email outbox follow-ups: `apps/web/src/server/email/outbox.ts` lengthens
  `CLAIM_TIMEOUT_MS` from `10_000` ms to `15_000` ms (above PostgREST's 8 s
  `statement_timeout` plus pooler/network jitter while remaining under
  `RUN_BUDGET_MS` = 30 s) and inspects both `claimSignal.aborted` and
  `isAbortError(error)` (excluding Postgres server-side rollback `57014`) to
  emit an explicit warning that an aborted `claim_outbox` call may still have
  committed and leased rows for 5 minutes. `apps/web/src/server/email/provider.ts`
  hardens `usesProductionDatabase(env)` to inspect the JWT `ref` claim of
  `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in addition
  to `PRODUCTION_SUPABASE_HOSTS` / `PRODUCTION_SUPABASE_REF` (cleanly ignoring
  opaque `sb_secret_*` keys and malformed tokens), backed by `DOS/DOS.Me#1870`
  with Vitest coverage (#273 / #305).
- PO configuration update (`docs/product-owner-config.md`): sets
  `promotion_po: any` so both Antigravity PO and Claude Code PO hold equal
  Production promotion authority (requiring JOY's popup approval on concrete
  steps and rollback plan with zero competing open `main` promotion PRs),
  records JOY's 2026-11-22 Antigravity PO takeover across `line:campaigns`,
  `line:money` and `line:platform` while Claude PO is quota-limited (preserving
  `po:agy` / `po:claude` mutual exclusion), and documents the 2026-11-21 local
  DB ban (`Give#294` / `DOS/DOS.Me#1855`, running Give pgTAP and migration
  replay in GitHub CI on `DOS/DOS.Me`) (#303 / #304).
- Parallel PO configuration (CC-PO v2.18.0): `docs/product-owner-config.md`
  assigns Antigravity `Campaigns Product Owner` (`acc0`) to `line:campaigns`
  (replacing paused Qwen Code sessions), enforces `po:agy` / `po:claude`
  mutual-exclusion `po_labels`, keeps Production (`main` / `give.vn`),
  `line:money` and `line:platform` exclusively under Claude Code
  `Give Product Owner` (`promotion_po: claude`), records JOY's authorization
  for Antigravity PO to pick up unclaimed `DOS/DOS.Me` prerequisites
  `#261`–`#264`, and adds CC-PO v2.18.0 gatekeeper and context-compaction keys
  (#292 / #293).
- Email throttling hold: the SMTP transport stays on AWS SES (host, port,
  login and key from env). When SES answers 454 "Daily message quota
  exceeded" (a quota shared with DOS.Me), the email is now held instead of
  counting an attempt: the run stops, the email waits an hour and never
  ends dead, and `/admin/emails` lists held emails (`THROTTLE:` errors) with
  when each will be dropped at its maximum age. SES's per-second 454
  "Maximum sending rate exceeded" stops the run and is retried after a
  minute as an ordinary failure. Every other error keeps the normal retry
  and permanent rules. A run against a database without the hold records an
  ordinary failure instead. Retrying emails with no recorded error stay
  listed. The shared DOS Brevo account was considered and not used (design
  §2.5.1). Needs DOS/DOS.Me `give.complete_outbox(..., p_hold)` first
  (#254).
- Email outbox (M4): Give sends email through `give.outbox`, filled in the
  same transaction as the event: a donation turning `received` (a receipt to
  the guest's donation email or the donor's account, with a fresh 7-day
  tracking link for guests), pledge `payment_due`, `payment_reminder` and
  `pledge_lapsed` notices, and campaign approved, changes requested,
  suspended and ended (organizer). `/api/cron/send-outbox` (every minute)
  leases due rows, sends them through AWS SES over SMTP (DOS.Me's provider,
  `nodemailer` 10.3.1, server-only) from `Give <no-reply@give.vn>`, retries
  after 1, 5, 15, 60, 180 and 360 minutes and marks a row dead after 7
  attempts; `/admin/emails` (admins) lists dead and retrying emails and sends
  a dead one again (audited). The campaign end summary is the only
  notification email: it carries an unsubscribe link (`/email/unsubscribe`,
  one-click `List-Unsubscribe`). No images or tracking pixels. Outside
  Production a log transport mails nobody unless `EMAIL_DELIVERY=smtp`, and
  then only `EMAIL_ALLOWLIST`; in Production sending waits for the SES
  credentials, and `EMAIL_DELIVERY=log` is refused there. Delivery is at
  least once: each event queues exactly one email, but a send whose result
  was lost, or that timed out (its connection is cut off and it waits an
  hour before the next attempt), can reach the recipient twice. A daily
  `/api/cron/purge-outbox` clears old addresses and payloads and expired
  tracking tokens (#254 / #257).
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

- Back-campaign receiving-account swap and `payment_due` pledge notices:
  extends `give.request_account_swap`, `give.decide_account_swap`,
  `give.account_has_swapped_history` and `give.record_bank_transaction`
  post-swap outflow cutoff to `back` campaigns (`live`, `suspended`,
  `changes_requested` with recorded transactions, and `succeeded` when
  `give.campaign_has_payments_due(id)` is true), preserving `#264` owner-only
  money boundaries, `#82` / `#119` lock order and self-review guards; adds
  in-app notice kind `payment_account_changed` and transactional outbox kind
  `pledge_account_swapped` (14-day max age, masked account details only,
  `give.claim_outbox` `account_superseded` / 90-day `payment_requests_stopped`
  hold / `not_due` / live `pledge_notice_payload` refresh), with 66 pgTAP
  assertions (#92 / DOS/DOS.Me#1873, on Beta). Migration
  `20261130140000_give_back_campaign_account_swap`.
- Monthly plan donor swap notifications: adds notification outbox kind
  `plan_account_swapped` (14-day max age, subject to `give.email_suppressions`),
  `give.outbox_on_account_swap` trigger enqueueing one masked, zero-PII row
  per active `give.donation_plans` donor on approved account swaps
  (`idempotency_key = 'plan_account_swapped:<swap_request_id>:<plan_id>'`),
  and `give.claim_outbox` send-time re-checks (`plan_not_active`,
  `account_superseded`, `unsubscribed`, `no_recipient`, `expired`) minting a
  fresh 60-day one-use stop token in `give.plan_stop_tokens`, with 53 pgTAP
  assertions (#291 / DOS/DOS.Me#1871, on Beta). Migration
  `20261130130000_give_plan_account_swap_notice`.
- Atomic expected-status guard and pre-launch recovery queue: adds
  backwards-compatible `p_expected_status text DEFAULT NULL` to
  `give.transition_campaign` (raising `GIVE_CAMPAIGN_STATUS_CHANGED`, SQLSTATE
  `40001`, checked after authorization and before idempotent replay while
  preserving `#82` / `#120` staff-role lock order), allows non-owner
  `moderator`/`admin` `suspended -> changes_requested` recovery for never-live
  campaigns with `starts_at > now()` and zero contributions (preserving `#55`
  money-history immutability and `#264` owner-only boundaries), and adds
  `give.campaigns_needing_recovery()` (disjoint from
  `campaigns_waiting_for_account`, listing `approved_past_end` and
  `suspended_before_start`), with 62 pgTAP assertions (#77 / DOS/DOS.Me#1872,
  on Beta). Migration `20261130120000_give_campaign_sendback_and_suspended_recovery`.
- Email outbox follow-ups: adds partial index `give.outbox_purge_settled_idx`,
  `give.contribution_access_tokens_expires_idx` and `FOR UPDATE SKIP LOCKED`
  batching in `give.purge_outbox`, restricts `give.claim_outbox`
  `to_email_hash` writes to `category = 'notification'` while clearing
  deleted-account and legacy transactional hashes on purge, protects active
  in-flight sends (`status = 'sending' AND locked_until > now()`) from purge
  step 1, caps `pledge_payment_due` / `pledge_payment_reminder` holds under
  `payments_stopped_at` at 90 days (`skipped`/`expired`), and recomputes
  `pledge_payment_reminder` `payload->'day'` on claim from
  `outcome_at + payments_stopped_total`, with 31 pgTAP assertions (#273 /
  DOS/DOS.Me#1870, on Beta). Migration `20261130110000_give_outbox_followups`.
- Co-organizers and single-use invites: `give.campaign_members` (editors only,
  blocking owner self-membership) and `give.campaign_member_invites` (32-byte
  SHA-256 token hashes only, zero direct table grants), 9 `SECURITY DEFINER`
  RPCs (`create_campaign_member_invite`, `revoke_campaign_member_invite`,
  `preview_campaign_member_invite`, `accept_campaign_member_invite`,
  `remove_campaign_member`, `list_campaign_members`,
  `list_campaign_member_invites`, `my_campaign_roles`, `campaign_public_team`),
  editor RLS helpers and concurrent-removal lock triggers
  (`campaigns_check_editor_on_update`, `campaign_children_lock_campaign`,
  `campaign_children_verify_insert_auth`), while keeping all money, receiving
  accounts, statements, refunds, fulfillment, monthly plans, draft deletion,
  `transition_campaign` and team management strictly owner-only, with 172 pgTAP
  assertions (#264 / DOS/DOS.Me#1856, on Beta). Migration
  `20261129170000_give_campaign_members`.
- Organizer public profile handle and bio: adds `handle` (unique, 3–40-char
  lowercase slug with reserved-word check) and `bio` (`<= 500` chars) to
  `give.organizers` with authenticated column grants and unchanged
  `organizers_reset_verification` so editing `handle`/`bio` preserves
  `verification_status`; extends `give.public_organizer` and
  `give.public_campaign_organizers` with `handle` and adds
  `give.public_organizer_profile` (joining active non-deleted DOS ID avatar)
  and `give.list_organizer_public_campaigns` (public campaigns only), with 57
  pgTAP assertions (#261 / DOS/DOS.Me#1851, on Beta). Migration
  `20261129160000_give_organizer_public_profile`.
- Campaign comments and comment reporting: `give.campaign_comments` (plain-text
  1–2000 chars, composite FK enforcing one-level replies within the same
  campaign) and `give.comment_reports` (6 reason codes, 1 open report per
  reporter/comment, 20/24h limit), privacy-safe RLS omitting raw user IDs and
  withholding replies under hidden parents from non-moderators, and 10
  `SECURITY DEFINER` RPCs (`list_campaign_comments`, `create_campaign_comment`,
  `edit_campaign_comment`, `delete_campaign_comment`, `hide_campaign_comment`,
  `report_campaign_comment`, `moderate_campaign_comment`,
  `resolve_comment_report`, `list_comment_reports`,
  `list_comment_moderation_history`) with rate limiting, self-review guards and
  `give.audit_log` entries, with 171 pgTAP assertions (#262 / DOS/DOS.Me#1853,
  on Beta). Migration `20261129150000_give_campaign_comments`.
- Privacy-safe daily campaign analytics: zero-PII `give.campaign_daily_analytics`
  counters keyed by `(campaign_id, metric_date, event_type, referrer_bucket)`,
  `give.normalize_referrer_bucket` (5 fixed buckets with anti-spoofing checks),
  service-role `give.record_campaign_event` (public campaigns only) and
  authenticated organizer/staff `give.get_campaign_analytics` (zero-filled
  daily series, referrer breakdown and ledger-derived conversion/contributions
  with cross-day split-payment deduplication), with 99 pgTAP assertions
  (#263 / DOS/DOS.Me#1852, on Beta). Migration
  `20261129120000_give_campaign_analytics`.
- Monthly donation plans A: `give.donation_plans`, `give.plan_stop_tokens`,
  `campaigns.allow_monthly` (needs `ends_at`), plan donations as ordinary
  contributions (`plan_id`, `plan_period`, one per month), RPCs
  `set_campaign_monthly`, `create_donation_plan`, `update_donation_plan`,
  `cancel_donation_plan`, `plan_stop_token_status`,
  `cancel_donation_plan_by_token`, `issue_plan_donations`,
  `expire_plan_donations`, `plan_end_notices`, `plan_followups`,
  `campaign_plan_supporters`; plans end on close, cancel, turn-off, the end
  date and account deletion; `plan_reminder`, `plan_followup` and
  `plan_ended` emails through the outbox, re-checked at send time, with
  `claim_outbox` minting the stop token (#275 / DOS/DOS.Me#1824).
- Email outbox: `give.outbox` (unique idempotency key, lease, attempts,
  backoff, dead), `give.email_suppressions`, `give.contribution_access_tokens`;
  enqueue triggers on `contributions`, `notices` and `campaign_status_events`;
  `give.claim_outbox` (re-checks each row: a receipt whose donation is no
  longer received, a payment request no longer due and rows past their
  kind's maximum age are skipped; payment requests wait while a campaign's
  requests are stopped; records the address it sends to),
  `give.complete_outbox` (an outcome-unknown timeout waits at least an hour),
  `give.release_outbox`, `give.retry_outbox` (admin, audited, not past the
  maximum age), `give.unsubscribe_email` (suppresses the address the email
  went to; suppressions are stored as SHA-256), `give.purge_outbox`
  (retention). Only the triggers enqueue, validating rows instead of
  catching errors; `recipient_user_id` has no foreign key to `auth.users`.
  RLS on, service role only (#254 / DOS/DOS.Me#1782). Migration
  `20261123090000_give_email_outbox`.
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
