import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * Campaign data layer over the shared Supabase `give` schema (DDL lives in
 * DOS-Me `supabase/migrations/20261031130000_give_schema_foundation.sql`).
 *
 * Every query takes the client it runs with, so the caller decides whose
 * rights apply: `dbAs()` for an anonymous visitor, `dbAs(token)` for the
 * signed-in user under RLS. Nothing here uses the service role.
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

export interface CampaignUpdate {
  id: string
  campaign_id: string
  author_id: string
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

/** Public pages never ask for the organizer's user id or the review note. */
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

export async function getCampaignById(db: Db, id: string): Promise<CampaignWithRefs | null> {
  const { data, error } = await db.from("campaigns").select(CAMPAIGN_WITH_REFS).eq("id", id).maybeSingle()
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
    .select("id, campaign_id, author_id, title, body, visibility, published_at, created_at")
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
  const { data, error } = await db
    .from("campaigns")
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
    .select("id, campaign_id, author_id, title, body, visibility, published_at, created_at")
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
  const { data, error } = await db
    .from("campaigns")
    .select(`${CAMPAIGN_WITH_REFS}, organizer:organizers(user_id, kind, legal_name, display_name, verification_status)`)
    .eq("status", "in_review")
    .order("submitted_at", { ascending: true })
  if (error) throw error
  return (data ?? []) as ReviewItem[]
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
