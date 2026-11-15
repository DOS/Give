"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/auth/session"
import { getCampaignById, isStaff } from "@/lib/campaigns"
import { dbErrorMessage, done, fail, OWN_TRANSFER_MESSAGES, type ActionResult, type DbErrorLike } from "@/lib/errors"
import { formatVnd } from "@/lib/format"
import { isUuid } from "@/lib/ids"
import { OWN_TRANSFER_LABEL, OWN_TRANSFER_REASON_MAX } from "@/lib/own-transfers"
import { FINANCE_ROLES } from "@/lib/receiving-accounts"
import { dbAs, dbService } from "@/lib/supabase"

/**
 * Marks money out of a campaign's old account and the same money into its new
 * account as one move between the campaign's own accounts (DOS/Give#84,
 * give.mark_own_account_transfer), by finance/admin staff only. The function
 * runs as the service role with the actor's id as an argument and repeats
 * every check under its locks. Because it trusts the id, the staff role and
 * both transactions are first read with the actor's own token: PostgREST
 * verifies that token, so a forged session cookie fails here. Marking the
 * same pair again returns the same pair, so a retry is safe.
 */

const SIGNED_OUT = "Phiên đăng nhập đã hết. Hãy đăng nhập lại."
const PICK_IN = "Chọn khoản tiền vào tương ứng ở tài khoản mới."

interface Leg {
  id: string
  direction: string
  campaign_id: string | null
  amount: number | string
  asset: string
}

export async function markOwnTransfer(outId: string, _state: ActionResult, form: FormData): Promise<ActionResult> {
  const session = await getSession()
  if (!session) return fail(SIGNED_OUT)
  if (!isUuid(outId)) return fail(OWN_TRANSFER_MESSAGES.GIVE_TRANSACTION_NOT_FOUND)
  const inId = String(form.get("in_transaction_id") ?? "").trim()
  if (!isUuid(inId)) return fail(PICK_IN)
  // Browsers submit line breaks as CRLF; count and store them as one character.
  const reason = String(form.get("reason") ?? "")
    .replace(/\r\n/g, "\n")
    .trim()
  if (!reason) return fail(OWN_TRANSFER_MESSAGES.GIVE_REASON_REQUIRED)
  // Counted in characters (code points), as the database's char_length does.
  if ([...reason].length > OWN_TRANSFER_REASON_MAX) return fail(OWN_TRANSFER_MESSAGES.GIVE_REASON_TOO_LONG)

  const db = dbAs(session.accessToken)
  let out: Leg | undefined
  let slug: string | null = null
  try {
    if (!(await isStaff(db, FINANCE_ROLES))) return fail(OWN_TRANSFER_MESSAGES.GIVE_NOT_ALLOWED)
    const { data, error } = await db
      .from("bank_transactions")
      .select("id, direction, campaign_id, amount, asset")
      .in("id", [outId, inId])
    if (error) throw error
    const legs = (data ?? []) as Leg[]
    out = legs.find((t) => t.id === outId)
    const incoming = legs.find((t) => t.id === inId)
    if (!out || !incoming) return fail(OWN_TRANSFER_MESSAGES.GIVE_TRANSACTION_NOT_FOUND)
    if (out.direction !== "out") return fail(OWN_TRANSFER_MESSAGES.GIVE_TRANSACTION_NOT_OUTBOUND)
    if (incoming.direction !== "in") return fail(OWN_TRANSFER_MESSAGES.GIVE_TRANSACTION_NOT_INBOUND)
    if (!out.campaign_id || !incoming.campaign_id) return fail(OWN_TRANSFER_MESSAGES.GIVE_TRANSACTION_UNATTRIBUTED)
    if (out.campaign_id !== incoming.campaign_id) return fail(OWN_TRANSFER_MESSAGES.GIVE_OWN_TRANSFER_CAMPAIGN_MISMATCH)
    if (Number(out.amount) !== Number(incoming.amount) || out.asset !== incoming.asset) {
      return fail(OWN_TRANSFER_MESSAGES.GIVE_OWN_TRANSFER_AMOUNT_MISMATCH)
    }
    slug = (await getCampaignById(db, out.campaign_id))?.slug ?? null
  } catch (error) {
    return fail(dbErrorMessage(error as DbErrorLike))
  }

  const { error } = await dbService().rpc("mark_own_account_transfer", {
    p_out_transaction_id: outId,
    p_in_transaction_id: inId,
    p_actor_id: session.user.id,
    p_reason: reason,
  })
  if (error) return fail(dbErrorMessage(error, OWN_TRANSFER_MESSAGES))

  revalidatePath("/admin/own-transfers")
  revalidatePath("/admin/unmatched")
  revalidatePath(`/me/campaigns/${out.campaign_id}`)
  revalidatePath(`/me/campaigns/${out.campaign_id}/disbursements`)
  revalidatePath(`/me/campaigns/${out.campaign_id}/unmatched`)
  if (slug) {
    revalidatePath(`/campaigns/${slug}`)
    revalidatePath(`/campaigns/${slug}/statement`)
  } else {
    revalidatePath("/campaigns/[slug]", "page")
    revalidatePath("/campaigns/[slug]/statement", "page")
  }
  return done(
    `Đã đánh dấu ${formatVnd(Number(out.amount))} là tiền chuyển sang tài khoản mới của chiến dịch. Hai giao dịch không còn tính vào tổng đã nhận hay đã chi, khoản tiền ra không còn là khoản chi chờ giải trình, và sao kê công khai ghi “${OWN_TRANSFER_LABEL}”.`
  )
}
