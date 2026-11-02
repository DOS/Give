import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Campaign data layer over the shared Supabase `give` schema (DDL lives in
 * DOS-Me `supabase/migrations/20261031130000_give_schema_foundation.sql`).
 *
 * Every query takes the client it runs with, so the caller decides whose
 * rights apply: `dbAs()` for an anonymous visitor, `dbAs(token)` for the
 * signed-in user under RLS. Nothing here uses the service role.
 *
 * anon and authenticated may select every campaign column except
 * `organizer_id` and `review_note` (DOS-Me
 * `20261101090000_give_campaign_read_hardening.sql`); a `select=*` on the
 * table fails. Organizers and staff read full rows through the
 * `give.managed_campaigns()` RPC instead.
 */

// The client is created without generated types, so rows come back untyped
// and are cast to the shapes below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, any, any>

export type CampaignType = "give" | "back"
export type FundingModel = "flexible" | "all_or_nothing"
export type CampaignStatus =
  | "draft"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "live"
  | "settling"
  | "succeeded"
  | "failed"
  | "closed"
  | "suspended"
  | "cancelled"
export type VerificationStatus = "unverified" | "pending" | "verified" | "rejected"
export type OrganizerKind = "individual" | "organization"

export interface Category {
  id: string
  slug: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  applies_to: CampaignType | "both"
  sort_order: number
}

export interface DisplayOptions {
  progress_bar: boolean
  backers_count: boolean
  time_remaining: boolean
}

export interface Campaign {
  id: string
  slug: string
  type: CampaignType
  funding_model: FundingModel
  organizer_id: string
  category_id: string | null
  title: string
  summary: string | null
  story: string | null
  beneficiary_name: string | null
  beneficiary_relation: string | null
  cover_media_id: string | null
  asset: "VND"
  goal_amount: number
  min_contribution: number
  stretch_goal_amount: number | null
  display_options: DisplayOptions
  starts_at: string | null
  ends_at: string | null
  payment_window_days: number
  status: CampaignStatus
  review_note: string | null
  submitted_at: string | null
  approved_at: string | null
  outcome_at: string | null
  created_at: string
  updated_at: string
}

export interface CampaignWithRefs extends Campaign {
  category: Pick<Category, "id" | "slug" | "name" | "icon" | "color"> | null
  cover: Pick<Media, "storage_path" | "alt"> | null
}

/** What public pages load: no organizer user id, no review note. */
export type PublicCampaign = Omit<CampaignWithRefs, "organizer_id" | "review_note">

export interface Milestone {
  id: string
  campaign_id: string
  title: string
  description: string | null
  target_amount: number
  unlock_note: string | null
  sort_order: number
}

export interface Media {
  id: string
  campaign_id: string
  kind: "image" | "youtube"
  storage_path: string | null
  youtube_id: string | null
  alt: string | null
  sort_order: number
}

/** author_id is withheld from clients: it is always the campaign's organizer. */
export interface CampaignUpdate {
  id: string
  campaign_id: string
  title: string
  body: string
  visibility: "public" | "backers"
  published_at: string | null
  created_at: string
}

export interface Organizer {
  user_id: string
  kind: OrganizerKind
  legal_name: string
  display_name: string
  phone: string | null
  verification_status: VerificationStatus
  verified_at: string | null
  created_at: string
}

export interface PublicOrganizer {
  display_name: string
  kind: OrganizerKind
  verification_status: VerificationStatus
}

// ---------------------------------------------------------------------------
// Status rules (mirrors give.is_public_status / give.is_editable_status and
// give.transition_campaign; the database stays the authority)
// ---------------------------------------------------------------------------

export const PUBLIC_STATUSES: readonly CampaignStatus[] = ["live", "settling", "succeeded", "failed", "closed"]
export const EDITABLE_STATUSES: readonly CampaignStatus[] = ["draft", "changes_requested"]

export function isPublicStatus(status: CampaignStatus): boolean {
  return PUBLIC_STATUSES.includes(status)
}

export function isEditableStatus(status: CampaignStatus): boolean {
  return EDITABLE_STATUSES.includes(status)
}

export function organizerCanCancel(status: CampaignStatus): boolean {
  return status === "draft" || status === "in_review" || status === "changes_requested" || status === "approved"
}

/** Organizers can post updates at any stage except cancelled or suspended. */
export function canPostUpdate(status: CampaignStatus): boolean {
  return status !== "cancelled" && status !== "suspended"
}

export const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Bản nháp",
  in_review: "Đang chờ duyệt",
  changes_requested: "Cần chỉnh sửa",
  approved: "Đã duyệt, chờ mở",
  live: "Đang gây quỹ",
  settling: "Đang tất toán",
  succeeded: "Thành công",
  failed: "Không đạt mục tiêu",
  closed: "Đã kết thúc",
  suspended: "Tạm dừng",
  cancelled: "Đã hủy",
}

export const TYPE_LABELS: Record<CampaignType, string> = {
  give: "Từ thiện",
  back: "Dự án",
}

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  unverified: "Chưa xác minh",
  pending: "Đang xác minh",
  verified: "Đã xác minh",
  rejected: "Bị từ chối xác minh",
}

export function fundingModelFor(type: CampaignType): FundingModel {
  return type === "give" ? "flexible" : "all_or_nothing"
}

export function categoriesFor(categories: readonly Category[], type: CampaignType): Category[] {
  return categories.filter((c) => c.applies_to === "both" || c.applies_to === type)
}

// ---------------------------------------------------------------------------
// Discovery filters
// ---------------------------------------------------------------------------

export interface DiscoveryFilters {
  type: CampaignType | null
  category: string | null
  q: string | null
}

function firstParam(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? ""
}

/**
 * Reduces a free-text search to letters, digits and single spaces, so it can
 * go into a PostgREST `or=(...ilike...)` filter without any of that syntax's
 * special characters (`,()."\`) or LIKE wildcards (`%_`). Returns null when
 * nothing searchable is left.
 */
export function normalizeSearch(input: string): string | null {
  const cleaned = input
    .normalize("NFC")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .trim()
  return cleaned.length >= 2 ? cleaned : null
}

export function parseDiscoveryFilters(params: Record<string, string | string[] | undefined>): DiscoveryFilters {
  const type = firstParam(params.type)
  const category = firstParam(params.category)
  return {
    type: type === "give" || type === "back" ? type : null,
    category: /^[a-z0-9]+(-[a-z0-9]+)*$/.test(category) && category.length <= 60 ? category : null,
    q: normalizeSearch(firstParam(params.q)),
  }
}

/**
 * PostgREST `or` filter matching a normalized search in title or summary.
 * Values are double-quoted so spaces survive the logic-tree parser; a
 * normalized term has no quote or backslash to escape.
 */
export function searchFilter(term: string): string {
  return `title.ilike."%${term}%",summary.ilike."%${term}%"`
}

/** Builds a /campaigns URL for the given filters, dropping empty ones. */
export function discoveryHref(filters: Partial<DiscoveryFilters>): string {
  const params = new URLSearchParams()
  if (filters.type) params.set("type", filters.type)
  if (filters.category) params.set("category", filters.category)
  if (filters.q) params.set("q", filters.q)
  const query = params.toString()
  return query ? `/campaigns?${query}` : "/campaigns"
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

const REFS =
  "category:categories(id, slug, name, icon, color), cover:campaign_media!campaigns_cover_media_fk(storage_path, alt)"

const CAMPAIGN_WITH_REFS = `*, ${REFS}`

/**
 * Every column anon and authenticated may select from the table: all but the
 * organizer's user id and the review note.
 */
const PUBLIC_CAMPAIGN_WITH_REFS = `id, slug, type, funding_model, category_id, title, summary, story, beneficiary_name,
  beneficiary_relation, cover_media_id, asset, goal_amount, min_contribution, stretch_goal_amount, display_options,
  starts_at, ends_at, payment_window_days, status, submitted_at, approved_at, outcome_at, created_at, updated_at,
  ${REFS}`.replace(/\s+/g, " ")

export async function listCategories(db: Db): Promise<Category[]> {
  const { data, error } = await db
    .from("categories")
    .select("id, slug, name, description, icon, color, applies_to, sort_order")
    .eq("is_active", true)
    .order("sort_order")
  if (error) throw error
  return (data ?? []) as Category[]
}

/** Live campaigns for discovery, newest first. */
export async function listPublicCampaigns(
  db: Db,
  filters: DiscoveryFilters,
  categories: readonly Category[],
  limit = 24
): Promise<PublicCampaign[]> {
  let query = db.from("campaigns").select(PUBLIC_CAMPAIGN_WITH_REFS).eq("status", "live")
  if (filters.type) query = query.eq("type", filters.type)
  if (filters.category) {
    const category = categories.find((c) => c.slug === filters.category)
    if (!category) return []
    query = query.eq("category_id", category.id)
  }
  if (filters.q) query = query.or(searchFilter(filters.q))
  const { data, error } = await query.order("approved_at", { ascending: false, nullsFirst: false }).limit(limit)
  if (error) throw error
  return (data ?? []) as unknown as PublicCampaign[]
}

/**
 * A campaign by slug, as far as the client may see it: anonymous clients only
 * get public statuses, the organizer and staff also see unpublished ones.
 */
export async function getCampaignBySlug(db: Db, slug: string): Promise<PublicCampaign | null> {
  const { data, error } = await db.from("campaigns").select(PUBLIC_CAMPAIGN_WITH_REFS).eq("slug", slug).maybeSingle()
  if (error) throw error
  return data as unknown as PublicCampaign | null
}

/**
 * Full rows (organizer id and review note included) of the campaigns the
 * caller organizes, plus every campaign for staff. Filters and embeds apply
 * to the RPC result like to the table.
 */
function managedCampaigns(db: Db, campaignId?: string) {
  return db.rpc("managed_campaigns", campaignId ? { p_campaign_id: campaignId } : {})
}

/** A campaign the caller organizes or, for staff, any campaign. */
export async function getCampaignById(db: Db, id: string): Promise<CampaignWithRefs | null> {
  const { data, error } = await managedCampaigns(db, id).select(CAMPAIGN_WITH_REFS).maybeSingle()
  if (error) throw error
  return data as CampaignWithRefs | null
}

export async function listMilestones(db: Db, campaignId: string): Promise<Milestone[]> {
  const { data, error } = await db
    .from("campaign_milestones")
    .select("id, campaign_id, title, description, target_amount, unlock_note, sort_order")
    .eq("campaign_id", campaignId)
    .order("sort_order")
    .order("target_amount")
  if (error) throw error
  return (data ?? []) as Milestone[]
}

/** Published public updates (what anonymous visitors see). */
export async function listPublishedUpdates(db: Db, campaignId: string): Promise<CampaignUpdate[]> {
  const { data, error } = await db
    .from("campaign_updates")
    .select("id, campaign_id, title, body, visibility, published_at, created_at")
    .eq("campaign_id", campaignId)
    .eq("visibility", "public")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as CampaignUpdate[]
}

/** Display name, kind and verification of a published campaign's organizer. */
export async function getPublicOrganizer(db: Db, campaignId: string): Promise<PublicOrganizer | null> {
  const { data, error } = await db.rpc("public_organizer", { p_campaign_id: campaignId })
  if (error) throw error
  const rows = (data ?? []) as PublicOrganizer[]
  return rows[0] ?? null
}

export async function getOrganizer(db: Db, userId: string): Promise<Organizer | null> {
  const { data, error } = await db
    .from("organizers")
    .select("user_id, kind, legal_name, display_name, phone, verification_status, verified_at, created_at")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw error
  return data as Organizer | null
}

export async function listMyCampaigns(db: Db, userId: string): Promise<CampaignWithRefs[]> {
  const { data, error } = await managedCampaigns(db)
    .select(CAMPAIGN_WITH_REFS)
    .eq("organizer_id", userId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as CampaignWithRefs[]
}

/** Every update of a campaign the caller organizes, drafts included. */
export async function listAllUpdates(db: Db, campaignId: string): Promise<CampaignUpdate[]> {
  const { data, error } = await db
    .from("campaign_updates")
    .select("id, campaign_id, title, body, visibility, published_at, created_at")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as CampaignUpdate[]
}

/** True when the signed-in caller holds one of the staff roles. */
export async function isStaff(db: Db, roles: readonly string[] = ["moderator", "admin"]): Promise<boolean> {
  const { data, error } = await db.rpc("is_admin", { p_roles: roles })
  if (error) return false
  return data === true
}

export interface ReviewItem extends CampaignWithRefs {
  organizer: Pick<Organizer, "user_id" | "kind" | "legal_name" | "display_name" | "verification_status"> | null
}

/** Campaigns waiting for review, oldest submission first (staff only under RLS). */
export async function listReviewQueue(db: Db): Promise<ReviewItem[]> {
  const { data, error } = await managedCampaigns(db)
    .select(`${CAMPAIGN_WITH_REFS}, organizer:organizers(user_id, kind, legal_name, display_name, verification_status)`)
    .eq("status", "in_review")
    .order("submitted_at", { ascending: true })
  if (error) throw error
  return (data ?? []) as ReviewItem[]
}

/**
 * Why an approved give campaign has no usable receiving account, as
 * give.campaigns_waiting_for_account reports it (DOS/Give#64).
 */
export type AccountProblem =
  "no_account" | "account_not_verified" | "account_not_owned" | "organizer_not_verified" | "name_mismatch"

export const ACCOUNT_PROBLEM_LABELS: Record<AccountProblem, string> = {
  no_account: "Không có tài khoản nhận tiền nào đang gắn.",
  account_not_verified: "Tài khoản đang gắn không còn ở trạng thái đã xác minh (có thể đã bị bộ phận tài chính khóa).",
  account_not_owned: "Tài khoản đang gắn không đứng tên người tổ chức của chiến dịch.",
  organizer_not_verified:
    "Hồ sơ người tổ chức chưa được xác minh (người tổ chức vừa đổi tên hoặc loại hồ sơ, hoặc hồ sơ bị đặt lại trạng thái xác minh).",
  name_mismatch: "Tên chủ tài khoản không còn trùng tên pháp lý của người tổ chức.",
}

export function accountProblemLabel(problem: string): string {
  return Object.hasOwn(ACCOUNT_PROBLEM_LABELS, problem)
    ? ACCOUNT_PROBLEM_LABELS[problem as AccountProblem]
    : "Tài khoản nhận tiền không dùng được."
}

export interface WaitingAdvice {
  /** The reason prefilled in the send-back form, or null when sending back would not help now. */
  sendBackReason: string | null
  /** What the moderator should know or do (instead of, or besides, sending it back), or null. */
  note: string | null
}

/**
 * What a moderator should do with an approved campaign waiting for an
 * account, from what the organizer can do after a send-back:
 * - A binding that recorded a transaction is never released before the
 *   campaign ends (money history; the swap is DOS/Give#55), so only finance
 *   re-enabling a disabled account heals it; a name mismatch or a foreign
 *   account with money history has no way forward in Give yet.
 * - An unverified organizer can neither verify nor bind an account until a
 *   moderator verifies the profile again, which alone may heal it (when the
 *   legal name did not change; otherwise it comes back as name_mismatch).
 * - An approved campaign may still take an account in the editor.
 * - A campaign past its end date never opens, so it is always sent back to
 *   fix its dates (the organizer resubmits once its account is usable).
 * Anything else is sent back to replace the account.
 */
export function waitingAdvice(
  row: Pick<WaitingForAccount, "account_problem" | "account_has_transactions" | "ends_at"> & {
    organizer: Pick<Organizer, "verification_status"> | null
  },
  now = new Date()
): WaitingAdvice {
  const ended = row.ends_at !== null && new Date(row.ends_at) <= now
  const verified = row.organizer?.verification_status === "verified"
  const money = row.account_has_transactions
  const problem = row.account_problem

  if (problem === "account_not_owned" || (money && problem === "name_mismatch")) {
    return {
      sendBackReason: null,
      note:
        (problem === "account_not_owned"
          ? "Tài khoản đang gắn không thuộc người tổ chức"
          : "Tài khoản đang gắn đã nhận giao dịch (lịch sử tiền của chiến dịch, chỉ nhả được 30 ngày sau khi chiến dịch bị hủy hoặc kết thúc) nhưng không còn trùng tên pháp lý") +
        ", và Give chưa hỗ trợ đổi tài khoản trong trường hợp này. Hãy liên hệ quản trị viên hệ thống, hoặc hủy chiến dịch nếu không thể chờ.",
    }
  }

  // What the organizer does about the account after a send-back, if anything.
  const waitFinance = money && problem === "account_not_verified"
  const accountStep =
    problem === "organizer_not_verified" || waitFinance
      ? null
      : problem === "no_account"
        ? "gắn một tài khoản đã xác minh đứng tên bạn"
        : "nhả tài khoản đang gắn, gắn một tài khoản đã xác minh đứng tên pháp lý hiện tại của bạn"

  const notes: string[] = []
  if (!verified) {
    notes.push(
      "Hồ sơ người tổ chức chưa được xác minh, nên người tổ chức không gắn được tài khoản nào: hãy xác minh lại hồ sơ (với tên pháp lý hiện tại) ở mục Xác minh người tổ chức. Nếu tên pháp lý không đổi, tài khoản đang gắn có thể dùng được trở lại."
    )
  }
  if (waitFinance) {
    notes.push(
      "Tài khoản đang gắn đã nhận giao dịch: đó là lịch sử tiền của chiến dịch, nên chỉ nhả được 30 ngày sau khi chiến dịch bị hủy hoặc kết thúc. Hãy liên hệ bộ phận tài chính để mở lại tài khoản nếu được."
    )
  }

  // A send-back helps only when the organizer then has something to do.
  const sendBack = ended || (verified && !waitFinance && problem !== "no_account")
  if (!sendBack) {
    if (problem === "no_account" && verified) {
      notes.push(
        "Chiến dịch đã duyệt vẫn gắn được tài khoản: người tổ chức chỉ cần gắn một tài khoản đã xác minh trong trang sửa chiến dịch, rồi chiến dịch tự mở."
      )
    }
    notes.push("Không cần yêu cầu chỉnh sửa lúc này; khi tài khoản dùng được, chiến dịch tự mở.")
    return { sendBackReason: null, note: notes.join(" ") }
  }
  if (ended) {
    notes.push(
      "Chiến dịch đã quá ngày kết thúc nên không tự mở kể cả khi tài khoản dùng được trở lại: hãy yêu cầu chỉnh sửa ngay để người tổ chức sửa ngày."
    )
  }

  const lead = ended
    ? "Chiến dịch đã quá ngày kết thúc mà chưa mở được vì không có tài khoản nhận tiền dùng được."
    : problem === "name_mismatch"
      ? "Tên chủ tài khoản nhận tiền đang gắn không còn trùng tên pháp lý của bạn."
      : "Tài khoản nhận tiền đang gắn không còn dùng được."
  const steps = [ended ? "sửa ngày kết thúc" : null, accountStep].filter((x): x is string => x !== null)
  const parts = [lead, `Hãy ${steps.join(", ")} rồi gửi duyệt lại.`]
  if (!verified) parts.push("Hồ sơ người tổ chức của bạn cần được xác minh lại trước khi gắn hay dùng được tài khoản.")
  if (waitFinance) {
    parts.push(
      "Tài khoản đang gắn đã nhận giao dịch nên không nhả được: chiến dịch chỉ gửi duyệt lại được khi bộ phận tài chính mở lại tài khoản đó."
    )
  }
  if (accountStep?.startsWith("nhả")) parts.push("Nếu không nhả được tài khoản, hãy liên hệ đội ngũ Give.")
  if (ended) parts.push("Nếu không còn cần gây quỹ, hãy hủy chiến dịch.")
  return { sendBackReason: parts.join(" "), note: notes.length > 0 ? notes.join(" ") : null }
}

export interface WaitingForAccount extends ReviewItem {
  account_problem: string
  /** The bound account already recorded a bank transaction, so the organizer cannot release it. */
  account_has_transactions: boolean
}

/**
 * Approved give campaigns without a usable receiving account, which the
 * activation cron skips, earliest start first (moderators and admins; others
 * get none). The database picks them; the rows come from managed_campaigns.
 */
export async function listWaitingForAccount(db: Db): Promise<WaitingForAccount[]> {
  const waiting = await db.rpc("campaigns_waiting_for_account")
  if (waiting.error) throw waiting.error
  const rows = (waiting.data ?? []) as {
    campaign_id: string
    account_problem: string
    account_has_transactions: boolean
  }[]
  if (rows.length === 0) return []
  const { data, error } = await managedCampaigns(db)
    .select(`${CAMPAIGN_WITH_REFS}, organizer:organizers(user_id, kind, legal_name, display_name, verification_status)`)
    .in(
      "id",
      rows.map((r) => r.campaign_id)
    )
  if (error) throw error
  const byId = new Map(((data ?? []) as ReviewItem[]).map((c) => [c.id, c]))
  return rows.flatMap((r) => {
    const campaign = byId.get(r.campaign_id)
    return campaign
      ? [{ ...campaign, account_problem: r.account_problem, account_has_transactions: r.account_has_transactions }]
      : []
  })
}

/**
 * Organizers who are not verified, oldest first (staff only under RLS).
 * Rejected ones stay listed so a moderator can verify them once fixed.
 */
export async function listOrganizersToVerify(db: Db, limit = 50): Promise<Organizer[]> {
  const { data, error } = await db
    .from("organizers")
    .select("user_id, kind, legal_name, display_name, phone, verification_status, verified_at, created_at")
    .in("verification_status", ["unverified", "pending", "rejected"])
    .order("created_at", { ascending: true })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as Organizer[]
}
