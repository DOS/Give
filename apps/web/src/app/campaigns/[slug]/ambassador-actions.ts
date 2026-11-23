"use server"

import { revalidatePath } from "next/cache"

import {
  ambassadorFormSchema,
  getMyCampaignAmbassador,
  upsertMyCampaignAmbassador,
  type MyCampaignAmbassador,
} from "@/lib/ambassadors"
import { getSession } from "@/lib/auth/session"
import { dbErrorMessage } from "@/lib/errors"
import { isUuid } from "@/lib/ids"
import { SLUG_PATTERN } from "@/lib/slug"
import { dbAs } from "@/lib/supabase"
import { firstError } from "@/lib/validation"

export interface AmbassadorActionState {
  ambassador: MyCampaignAmbassador | null
  message?: string
  error?: string
}

const SIGNED_OUT = "Hãy đăng nhập để tạo liên kết kêu gọi giúp chiến dịch."
const INVALID_CAMPAIGN = "Không tìm thấy chiến dịch công khai này."
const AMBASSADOR_ERROR_OVERRIDES: Record<string, string> = {
  GIVE_CAMPAIGN_NOT_ACCEPTING: "Chiến dịch này hiện không còn mở tạo liên kết kêu gọi.",
}

/**
 * Creates or updates the signed-in user's ambassador link for a live or public
 * pre-launch campaign (DOS/Give#319).
 *
 * Runs strictly under the caller's own JWT (`dbAs(session.accessToken)`) via
 * `give.upsert_my_campaign_ambassador` — zero `dbService()` usage, zero money
 * permissions, and `ref_code` remains immutable once created.
 */
export async function saveMyCampaignAmbassador(
  campaignId: string,
  slug: string,
  state: AmbassadorActionState,
  form: FormData
): Promise<AmbassadorActionState> {
  const session = await getSession()
  if (!session) return { ambassador: state.ambassador, error: SIGNED_OUT }
  if (!isUuid(campaignId)) return { ambassador: state.ambassador, error: INVALID_CAMPAIGN }

  const parsed = ambassadorFormSchema.safeParse({
    display_name: String(form.get("display_name") ?? ""),
    show_on_leaderboard: form.get("show_on_leaderboard") === "on",
  })
  if (!parsed.success) {
    return { ambassador: state.ambassador, error: firstError(parsed.error) }
  }

  const db = dbAs(session.accessToken)
  try {
    const saved = await upsertMyCampaignAmbassador(db, {
      campaignId,
      displayName: parsed.data.display_name,
      showOnLeaderboard: parsed.data.show_on_leaderboard,
    })

    // Refresh personal matched stats under the same user JWT; fall back to
    // previous matched counts on transient read error so the saved link still renders.
    const refreshed = await getMyCampaignAmbassador(db, campaignId).catch(() => null)
    const nextAmbassador: MyCampaignAmbassador = refreshed ?? {
      ref_code: saved.ref_code,
      display_name: saved.display_name,
      show_on_leaderboard: saved.show_on_leaderboard,
      matched_count: state.ambassador?.matched_count ?? 0,
      matched_total_vnd: state.ambassador?.matched_total_vnd ?? 0,
      created_at: saved.created_at,
      updated_at: saved.created_at,
    }

    if (SLUG_PATTERN.test(slug) && slug.length <= 80) revalidatePath(`/campaigns/${slug}`)
    revalidatePath("/me")

    return {
      ambassador: nextAmbassador,
      message: state.ambassador ? "Đã cập nhật liên kết kêu gọi của bạn." : "Đã tạo liên kết kêu gọi của bạn.",
    }
  } catch (error: unknown) {
    const err = error as { code?: string; message?: string } | null
    if (err?.code?.startsWith("PGRST30")) {
      return { ambassador: state.ambassador, error: "Phiên đăng nhập đã hết. Hãy đăng nhập lại." }
    }
    return { ambassador: state.ambassador, error: dbErrorMessage(err, AMBASSADOR_ERROR_OVERRIDES) }
  }
}
