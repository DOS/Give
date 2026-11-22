import type {
  CampaignStatus,
  CampaignType,
  CardCampaign,
  Db,
  DisplayOptions,
  OrganizerKind,
  VerificationStatus,
} from "./campaigns"
import { dbErrorMessage, giveErrorCode, type DbErrorLike } from "./errors"
import {
  isReservedOrganizerHandle,
  isValidOrganizerHandleFormat,
  normalizeOrganizerHandle,
  ORGANIZER_BIO_TOO_LONG_MESSAGE,
  ORGANIZER_HANDLE_TAKEN_MESSAGE,
  safeAvatarUrl,
} from "./organizer-handle"

/**
 * Public organizer profile data layer over the DOS.Me RPCs added in
 * `20261129160000_give_organizer_public_profile.sql` (DOS/Give#261, #251).
 *
 * Every function runs on the caller's Supabase client (`dbAs()` for anonymous
 * public visitors) and explicitly whitelists public fields so private columns
 * (`user_id`, `legal_name`, `phone`, email, receiving accounts) can never reach
 * a public page.
 */

export interface PublicOrganizerProfile {
  handle: string
  display_name: string
  avatar_url: string | null
  kind: OrganizerKind
  verification_status: VerificationStatus
  bio: string | null
  created_at: string
}

export const ORGANIZER_KIND_LABELS: Record<OrganizerKind, string> = {
  individual: "Cá nhân",
  organization: "Tổ chức",
}

/** Maps database errors from updating `give.organizers (handle, bio)` into clear Vietnamese copy. */
export function publicProfileDbErrorMessage(error: DbErrorLike | null | undefined): string {
  if (giveErrorCode(error)) return dbErrorMessage(error)
  if (error?.code === "23505") return ORGANIZER_HANDLE_TAKEN_MESSAGE
  if (error?.code === "23514" && error.message?.includes("organizers_bio_check")) {
    return ORGANIZER_BIO_TOO_LONG_MESSAGE
  }
  return dbErrorMessage(error)
}

interface RawProfileRow {
  handle: string
  display_name: string
  avatar_url: string | null
  kind: OrganizerKind
  verification_status: VerificationStatus
  bio: string | null
  created_at: string
}

/**
 * Looks up a public organizer profile by handle through
 * `give.public_organizer_profile(p_handle)`. Returns null immediately for
 * invalid or reserved handles without hitting the database.
 */
export async function getPublicOrganizerProfile(db: Db, rawHandle: string): Promise<PublicOrganizerProfile | null> {
  const handle = normalizeOrganizerHandle(rawHandle)
  if (!isValidOrganizerHandleFormat(handle) || isReservedOrganizerHandle(handle)) return null

  const { data, error } = await db.rpc("public_organizer_profile", { p_handle: handle })
  if (error) throw error

  const row = ((data ?? []) as RawProfileRow[])[0]
  if (!row) return null

  return {
    handle: row.handle,
    display_name: row.display_name,
    avatar_url: safeAvatarUrl(row.avatar_url),
    kind: row.kind,
    verification_status: row.verification_status,
    bio: row.bio ?? null,
    created_at: row.created_at,
  }
}

interface RawOrganizerCampaignRow {
  id: string
  slug: string
  type: CampaignType
  title: string
  summary: string | null
  goal_amount: number | string
  ends_at: string | null
  status: CampaignStatus
  display_options: DisplayOptions
  cover_storage_path: string | null
  cover_alt: string | null
  created_at: string
}

/**
 * Lists up to 100 public-status campaigns for an organizer handle via
 * `give.list_organizer_public_campaigns(p_handle, p_limit, p_offset)`.
 * Ledger totals are joined separately from `give.public_campaigns` by id.
 */
export async function listOrganizerPublicCampaigns(
  db: Db,
  rawHandle: string,
  limit = 100,
  offset = 0
): Promise<CardCampaign[]> {
  const handle = normalizeOrganizerHandle(rawHandle)
  if (!isValidOrganizerHandleFormat(handle) || isReservedOrganizerHandle(handle)) return []

  const clampedLimit = Math.min(Math.max(Math.trunc(limit), 1), 100)
  const clampedOffset = Math.max(Math.trunc(offset), 0)

  const { data, error } = await db.rpc("list_organizer_public_campaigns", {
    p_handle: handle,
    p_limit: clampedLimit,
    p_offset: clampedOffset,
  })
  if (error) throw error

  return ((data ?? []) as RawOrganizerCampaignRow[]).map((row) => ({
    id: row.id,
    slug: row.slug,
    type: row.type,
    title: row.title,
    goal_amount: Number(row.goal_amount) || 0,
    ends_at: row.ends_at ?? null,
    status: row.status,
    display_options: row.display_options,
    cover: row.cover_storage_path ? { storage_path: row.cover_storage_path, alt: row.cover_alt ?? null } : null,
  }))
}
