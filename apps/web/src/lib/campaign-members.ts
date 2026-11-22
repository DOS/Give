import { z } from "zod"

import {
  listManagedCampaignsByIds,
  type CampaignStatus,
  type CampaignWithRefs,
  type Db,
  type OrganizerKind,
  type VerificationStatus,
} from "./campaigns"
import { safeAvatarUrl } from "./organizer-handle"

export { safeAvatarUrl }

/**
 * Co-organizers (campaign editors), single-use expiring invites, and public
 * campaign team display (DOS/Give#253; DB contract in DOS/Give#264, migration
 * `supabase/migrations/20261129170000_give_campaign_members.sql`).
 *
 * Every authenticated RPC runs with `dbAs(session.accessToken)` and derives the
 * actor from `auth.uid()` — never `dbService()` and never a spoofable actor id.
 */

export type CampaignMemberRole = "owner" | "editor"

export const MAX_CAMPAIGN_MEMBERS = 20
export const MAX_CAMPAIGN_INVITES = 20
export const INVITE_EXPIRY_MIN_HOURS = 1
export const INVITE_EXPIRY_MAX_HOURS = 720
export const DEFAULT_INVITE_EXPIRY_HOURS = 168
export const INVITE_NOTE_MAX = 120
export const INVITE_TOKEN_RE = /^[0-9a-f]{64}$/i
export const CO_ORGANIZER_FALLBACK_NAME = "Đồng tổ chức"
export const OWNER_FALLBACK_NAME = "Người tổ chức"

export const INVITE_EXPIRY_PRESETS = [
  { hours: 24, label: "24 giờ" },
  { hours: 72, label: "3 ngày" },
  { hours: 168, label: "7 ngày (mặc định)" },
  { hours: 720, label: "30 ngày" },
] as const

export type CampaignInviteStatus = "pending" | "accepted" | "revoked" | "expired"
export type InvitePreviewStatus = "pending" | "revoked" | "accepted" | "expired" | "unavailable" | "invalid"

export const INVITE_STATUS_LABELS: Record<CampaignInviteStatus, string> = {
  pending: "Đang chờ",
  accepted: "Đã chấp nhận",
  revoked: "Đã thu hồi",
  expired: "Hết hạn",
}

export interface CampaignMemberRow {
  user_id: string
  role: "editor"
  display_name: string | null
  avatar_url: string | null
  invited_by: string | null
  accepted_at: string
  created_at: string
}

export interface CampaignMemberInviteRow {
  invite_id: string
  campaign_id: string
  role: "editor"
  note: string | null
  expires_at: string
  accepted_at: string | null
  accepted_by: string | null
  accepted_by_display_name: string | null
  revoked_at: string | null
  created_at: string
  status: CampaignInviteStatus
}

export interface CreatedCampaignInvite {
  invite_id: string
  token: string
  expires_at: string
}

export interface CampaignInvitePreview {
  status: InvitePreviewStatus
  campaign_id: string | null
  campaign_slug: string | null
  campaign_title: string | null
  organizer_display_name: string | null
  role: string | null
  expires_at: string | null
}

export interface AcceptedCampaignInvite {
  campaign_id: string
  campaign_slug: string
  role: string
  accepted_at: string
}

export interface PublicTeamMember {
  member_role: CampaignMemberRole
  display_name: string | null
  avatar_url: string | null
  kind: OrganizerKind | null
  verification_status: VerificationStatus | null
  joined_at: string | null
}

export interface WorkspaceCampaign extends CampaignWithRefs {
  role: CampaignMemberRole
}

const MAX_ROLES_PER_CALL = 200

/** Owners can create invites on any campaign that is not cancelled or suspended. */
export function isInvitableStatus(status: CampaignStatus): boolean {
  return status !== "cancelled" && status !== "suspended"
}

export function teamTabHref(campaignId: string): string {
  return `/me/campaigns/${campaignId}?tab=team`
}

/** Validates and normalizes a raw 64-char hex invite token; returns null for malformed input. */
export function normalizeInviteToken(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  if (!INVITE_TOKEN_RE.test(trimmed)) return null
  return trimmed.toLowerCase()
}

/** Relative path to the invite acceptance page for a normalized token. */
export function invitePath(token: string): string {
  return `/invites/${encodeURIComponent(token)}`
}

/**
 * Neutral Vietnamese display name fallback. The database suppresses deleted or
 * inactive accounts to `'Organizer'`, `'Co-organizer'`, or `NULL` so zero PII leaks.
 */
export function memberDisplayName(displayName: string | null | undefined, role: CampaignMemberRole = "editor"): string {
  const trimmed = displayName?.trim()
  const lower = trimmed?.toLowerCase()
  if (!trimmed || lower === "co-organizer" || lower === "organizer") {
    return role === "owner" ? OWNER_FALLBACK_NAME : CO_ORGANIZER_FALLBACK_NAME
  }
  return trimmed
}

/** First Unicode code point for the 36px initial tile (DESIGN.md 9). */
export function memberInitial(displayName: string | null | undefined, role: CampaignMemberRole = "editor"): string {
  const label = memberDisplayName(displayName, role)
  return Array.from(label)[0]?.toUpperCase() ?? "?"
}

export const createInviteSchema = z.object({
  expires_in_hours: z.preprocess(
    (v) => (v === undefined || v === null || String(v).trim() === "" ? DEFAULT_INVITE_EXPIRY_HOURS : Number(v)),
    z
      .number({ message: "Thời hạn lời mời không hợp lệ." })
      .int("Thời hạn lời mời phải là số giờ nguyên.")
      .min(INVITE_EXPIRY_MIN_HOURS, "Thời hạn lời mời phải từ 1 đến 720 giờ (tối đa 30 ngày).")
      .max(INVITE_EXPIRY_MAX_HOURS, "Thời hạn lời mời phải từ 1 đến 720 giờ (tối đa 30 ngày).")
  ),
  note: z
    .string()
    .trim()
    .max(INVITE_NOTE_MAX, `Ghi chú lời mời tối đa ${INVITE_NOTE_MAX} ký tự.`)
    .transform((v) => (v === "" ? null : v)),
})

/**
 * Reads the signed-in caller's roles (`owner` | `editor`) via
 * `give.my_campaign_roles`. Chunks `campaignIds` to the RPC's 200-id cap.
 */
export async function getMyCampaignRoles(
  db: Db,
  campaignIds?: readonly string[]
): Promise<Map<string, CampaignMemberRole>> {
  const roles = new Map<string, CampaignMemberRole>()
  if (campaignIds) {
    const unique = [...new Set(campaignIds)]
    if (unique.length === 0) return roles
    for (let i = 0; i < unique.length; i += MAX_ROLES_PER_CALL) {
      const { data, error } = await db.rpc("my_campaign_roles", {
        p_campaign_ids: unique.slice(i, i + MAX_ROLES_PER_CALL),
      })
      if (error) throw error
      for (const row of (data ?? []) as { campaign_id: string; role: string }[]) {
        if (row.role === "owner" || row.role === "editor") {
          roles.set(row.campaign_id, row.role)
        }
      }
    }
    return roles
  }

  const { data, error } = await db.rpc("my_campaign_roles", {})
  if (error) throw error
  for (const row of (data ?? []) as { campaign_id: string; role: string }[]) {
    if (row.role === "owner" || row.role === "editor") {
      roles.set(row.campaign_id, row.role)
    }
  }
  return roles
}

/** Reads the caller's role (`owner` | `editor` | null) on a single campaign. */
export async function getMyCampaignRole(db: Db, campaignId: string): Promise<CampaignMemberRole | null> {
  const roles = await getMyCampaignRoles(db, [campaignId])
  return roles.get(campaignId) ?? null
}

/**
 * Lists campaigns where the signed-in user is the owner or an accepted editor
 * for `/me/campaigns`, excluding unrelated campaigns visible only to staff.
 */
export async function listMyWorkspaceCampaigns(db: Db, userId: string): Promise<WorkspaceCampaign[]> {
  const roles = await getMyCampaignRoles(db)
  if (roles.size === 0) return []
  const campaigns = await listManagedCampaignsByIds(db, [...roles.keys()])
  return campaigns
    .map((campaign): WorkspaceCampaign | null => {
      if (campaign.organizer_id === userId) return { ...campaign, role: "owner" }
      if (roles.get(campaign.id) === "editor") return { ...campaign, role: "editor" }
      return null
    })
    .filter((item): item is WorkspaceCampaign => item !== null)
}

/** Lists accepted editors of a campaign (`give.list_campaign_members`, owner & staff only). */
export async function listCampaignMembers(db: Db, campaignId: string): Promise<CampaignMemberRow[]> {
  const { data, error } = await db.rpc("list_campaign_members", { p_campaign_id: campaignId })
  if (error) throw error
  return (data ?? []) as CampaignMemberRow[]
}

/** Lists invites of a campaign (`give.list_campaign_member_invites`, owner & staff only). */
export async function listCampaignMemberInvites(db: Db, campaignId: string): Promise<CampaignMemberInviteRow[]> {
  const { data, error } = await db.rpc("list_campaign_member_invites", { p_campaign_id: campaignId })
  if (error) throw error
  return (data ?? []) as CampaignMemberInviteRow[]
}

/**
 * Previews an invite for a signed-in user (`give.preview_campaign_member_invite`).
 * Metadata is only populated by the DB when `status = 'pending'`.
 */
export async function previewCampaignMemberInvite(db: Db, token: string): Promise<CampaignInvitePreview | null> {
  const { data, error } = await db.rpc("preview_campaign_member_invite", { p_token: token })
  if (error) throw error
  const rows = Array.isArray(data) ? data : data ? [data] : []
  const row = rows[0] as CampaignInvitePreview | undefined
  return row ?? null
}

/**
 * Lists the public team (owner first, then accepted editors ordered by
 * `joined_at ASC`) of a public-status campaign (`give.campaign_public_team`).
 */
export async function listCampaignPublicTeam(db: Db, campaignId: string): Promise<PublicTeamMember[]> {
  const { data, error } = await db.rpc("campaign_public_team", { p_campaign_id: campaignId })
  if (error) throw error
  return (data ?? []) as PublicTeamMember[]
}
