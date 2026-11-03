"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import { getCampaignById, type CampaignWithRefs } from "@/lib/campaigns"
import { dbErrorMessage, done, fail, type ActionResult, type DbErrorLike } from "@/lib/errors"
import { formatVnd } from "@/lib/format"
import { isUuid } from "@/lib/ids"
import {
  canEditTiers,
  canRetireTier,
  listCampaignTiers,
  MAX_TIERS,
  moveTier,
  sortTiers,
  type RewardTier,
} from "@/lib/reward-tiers"
import { dbAs, dbService } from "@/lib/supabase"
import { firstError, formFields, rewardTierSchema } from "@/lib/validation"

/**
 * The creator's reward tiers of a back campaign (DOS/Give#83).
 *
 * The tier RPCs (DOS/Give#30) run as the service role and trust the actor id
 * passed in, so every action first reads the campaign and its tiers with the
 * user's own token, which PostgREST verifies, and stops on any error. The
 * database repeats every check under the campaign lock.
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
const NOT_EDITABLE =
  "Chỉ thêm, sửa, xóa hay sắp xếp phần thưởng được khi dự án còn là bản nháp hoặc cần chỉnh sửa. Sau khi được duyệt, bạn chỉ ngừng nhận được mức chưa có ai cam kết."
const NOT_RETIRABLE =
  "Chỉ ngừng nhận được mức phần thưởng chưa có ai cam kết, khi dự án đã duyệt, đang gây quỹ hoặc tạm dừng."

const TIER_MESSAGES: Record<string, string> = { GIVE_CAMPAIGN_NOT_EDITABLE: NOT_EDITABLE }

type Loaded =
  { campaign: CampaignWithRefs; tiers: RewardTier[]; error: null } | { campaign: null; tiers: null; error: string }

/** The caller's own back campaign and its tiers, read with their token. */
async function ownTiers(accessToken: string, userId: string, campaignId: string): Promise<Loaded> {
  const notFound = dbErrorMessage({ message: "GIVE_CAMPAIGN_NOT_FOUND" })
  if (!isUuid(campaignId)) return { campaign: null, tiers: null, error: notFound }
  const db = dbAs(accessToken)
  let campaign, tiers
  try {
    ;[campaign, tiers] = await Promise.all([getCampaignById(db, campaignId), listCampaignTiers(db, campaignId)])
  } catch (error) {
    return { campaign: null, tiers: null, error: dbErrorMessage(error as DbErrorLike) }
  }
  // Staff can read every campaign; tiers are the organizer's alone.
  if (!campaign || campaign.organizer_id !== userId) return { campaign: null, tiers: null, error: notFound }
  if (campaign.type !== "back") {
    return { campaign: null, tiers: null, error: dbErrorMessage({ message: "GIVE_REWARD_TIERS_BACK_ONLY" }) }
  }
  return { campaign, tiers, error: null }
}

function refresh(campaign: Pick<CampaignWithRefs, "id" | "slug">) {
  revalidatePath(`/me/campaigns/${campaign.id}`)
  revalidatePath(`/campaigns/${campaign.slug}`)
}

/** Creates a tier (tierId null, placed last) or updates one, while the campaign is editable. */
export async function saveRewardTier(
  campaignId: string,
  tierId: string | null,
  _state: ActionResult,
  form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (tierId !== null && !isUuid(tierId)) return fail(dbErrorMessage({ message: "GIVE_REWARD_TIER_NOT_FOUND" }))
  const { campaign, tiers, error: loadError } = await ownTiers(session.accessToken, session.user.id, campaignId)
  if (!campaign) return fail(loadError)
  if (!canEditTiers(campaign.status)) return fail(NOT_EDITABLE)
  if (tierId !== null && !tiers.some((t) => t.id === tierId)) {
    return fail(dbErrorMessage({ message: "GIVE_REWARD_TIER_NOT_FOUND" }))
  }
  if (tierId === null && tiers.length >= MAX_TIERS) return fail(dbErrorMessage({ message: "GIVE_REWARD_TIER_LIMIT" }))

  const parsed = rewardTierSchema.safeParse(
    formFields(form, [
      "title",
      "min_amount",
      "description",
      "quantity_limit",
      "estimated_delivery",
      "requires_shipping",
      "shipping_note",
    ])
  )
  if (!parsed.success) return fail(firstError(parsed.error))
  const values = parsed.data
  const belowMinimum = `Mức tối thiểu của phần thưởng không được thấp hơn mức góp tối thiểu của dự án (${formatVnd(campaign.min_contribution)}).`
  if (values.min_amount < campaign.min_contribution) return fail(belowMinimum)

  const { error } = await dbService().rpc("save_reward_tier", {
    p_actor_id: session.user.id,
    p_campaign_id: campaign.id,
    p_tier_id: tierId,
    p_title: values.title,
    p_min_amount: values.min_amount,
    p_description: values.description,
    p_quantity_limit: values.quantity_limit,
    p_estimated_delivery: values.estimated_delivery,
    p_requires_shipping: values.requires_shipping,
    // The note says how shipping works, so it only belongs to a shipped reward.
    p_shipping_note: values.requires_shipping ? values.shipping_note : null,
    // A new tier goes last; an edit keeps its place.
    p_sort_order: null,
  })
  if (error) return fail(dbErrorMessage(error, { ...TIER_MESSAGES, GIVE_AMOUNT_BELOW_MINIMUM: belowMinimum }))
  refresh(campaign)
  return done(tierId === null ? "Đã thêm phần thưởng." : "Đã lưu phần thưởng.")
}

export async function deleteRewardTier(
  campaignId: string,
  tierId: string,
  _state: ActionResult,
  _form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(tierId)) return fail(dbErrorMessage({ message: "GIVE_REWARD_TIER_NOT_FOUND" }))
  const { campaign, tiers, error: loadError } = await ownTiers(session.accessToken, session.user.id, campaignId)
  if (!campaign) return fail(loadError)
  if (!canEditTiers(campaign.status)) return fail(NOT_EDITABLE)
  if (!tiers.some((t) => t.id === tierId)) return fail(dbErrorMessage({ message: "GIVE_REWARD_TIER_NOT_FOUND" }))

  const { error } = await dbService().rpc("delete_reward_tier", { p_actor_id: session.user.id, p_tier_id: tierId })
  if (error) return fail(dbErrorMessage(error, TIER_MESSAGES))
  refresh(campaign)
  return done("Đã xóa phần thưởng.")
}

/** Moves a tier one place up or down; the database gets the whole new order. */
export async function moveRewardTier(
  campaignId: string,
  tierId: string,
  direction: "up" | "down",
  _state: ActionResult,
  _form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(tierId) || (direction !== "up" && direction !== "down")) {
    return fail(dbErrorMessage({ message: "GIVE_REWARD_TIER_NOT_FOUND" }))
  }
  const { campaign, tiers, error: loadError } = await ownTiers(session.accessToken, session.user.id, campaignId)
  if (!campaign) return fail(loadError)
  if (!canEditTiers(campaign.status)) return fail(NOT_EDITABLE)
  const order = moveTier(
    sortTiers(tiers).map((t) => t.id),
    tierId,
    direction
  )
  if (!order) return fail(dbErrorMessage({ message: "GIVE_REWARD_TIER_ORDER_INVALID" }))

  const { error } = await dbService().rpc("reorder_reward_tiers", {
    p_actor_id: session.user.id,
    p_campaign_id: campaign.id,
    p_tier_ids: order,
  })
  if (error) return fail(dbErrorMessage(error, TIER_MESSAGES))
  refresh(campaign)
  return done("Đã đổi thứ tự.")
}

/** After approval: stops a tier nobody pledged to from taking new pledges. */
export async function retireRewardTier(
  campaignId: string,
  tierId: string,
  _state: ActionResult,
  _form: FormData
): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(tierId)) return fail(dbErrorMessage({ message: "GIVE_REWARD_TIER_NOT_FOUND" }))
  const { campaign, tiers, error: loadError } = await ownTiers(session.accessToken, session.user.id, campaignId)
  if (!campaign) return fail(loadError)
  const tier = tiers.find((t) => t.id === tierId)
  if (!tier) return fail(dbErrorMessage({ message: "GIVE_REWARD_TIER_NOT_FOUND" }))
  if (tier.status === "retired") return done("Mức phần thưởng này đã ngừng nhận.")
  if (canEditTiers(campaign.status)) return fail("Dự án chưa được duyệt: hãy xóa hoặc sửa mức này.")
  if (!canRetireTier(campaign.status, { ...tier, quantity_claimed: 0 })) return fail(NOT_RETIRABLE)
  if (tier.quantity_claimed > 0) return fail(dbErrorMessage({ message: "GIVE_REWARD_TIER_HAS_PLEDGES" }))

  const { error } = await dbService().rpc("retire_reward_tier", { p_actor_id: session.user.id, p_tier_id: tier.id })
  if (error) return fail(dbErrorMessage(error, { GIVE_CAMPAIGN_NOT_EDITABLE: NOT_RETIRABLE }))
  refresh(campaign)
  return done("Đã ngừng nhận cam kết mới cho mức này.")
}
