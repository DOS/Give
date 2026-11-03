import { bankLabel } from "./banks"
import type { CampaignStatus, CampaignType, Db, VerificationStatus } from "./campaigns"
import { formatDateTime } from "./format"
import type { ReceivingAccount } from "./receiving-accounts"

/**
 * Replacing the receiving account of a give campaign that may hold money
 * (DOS/Give#55; DDL in DOS-Me
 * `supabase/migrations/20261105090000_give_live_campaign_account_swap.sql`).
 *
 * A live or suspended give campaign, or one sent back for changes whose
 * account already recorded a bank transaction, cannot release its account.
 * When that account stops being usable, the organizer asks for a swap to
 * another of their verified accounts (give.request_account_swap), and finance
 * or an admin approves it (give.decide_account_swap): in one transaction the
 * old binding ends and the new one starts at the same instant. Transactions
 * keep their campaign by the time the bank booked them, so money that reached
 * the old account before the swap stays the campaign's, and the public pages
 * show the change with its date (give.public_account_changes).
 */

export type SwapStatus = "pending" | "approved" | "rejected" | "cancelled"

export interface AccountSwapRequest {
  id: string
  campaign_id: string
  old_binding_id: string
  new_receiving_account_id: string
  new_binding_id: string | null
  reason: string
  status: SwapStatus
  decided_at: string | null
  decision_note: string | null
  public_note: string | null
  created_at: string
}

/** Columns authenticated may select (DOS-Me grants): never who asked or which staff member decided. */
const SWAP_COLUMNS =
  "id, campaign_id, old_binding_id, new_receiving_account_id, new_binding_id, reason, status, decided_at, decision_note, public_note, created_at"

export const SWAP_STATUS_LABELS: Record<SwapStatus, string> = {
  pending: "Chờ tài chính duyệt",
  approved: "Đã đổi tài khoản",
  rejected: "Bị từ chối",
  cancelled: "Đã rút yêu cầu",
}

/** Longest reason or note the database keeps; the public note is shorter. */
export const SWAP_REASON_MAX = 1000
export const SWAP_PUBLIC_NOTE_MAX = 300

/**
 * Campaign statuses a swap is for (give.is_swap_status). A campaign sent back
 * for changes swaps only when its bound account recorded a transaction;
 * otherwise the organizer releases it and binds another (DOS/Give#38).
 */
export const SWAP_STATUSES: readonly CampaignStatus[] = ["live", "suspended", "changes_requested"]

/** Whether the organizer may ask to swap the campaign's bound account now. */
export function canAskSwap(status: CampaignStatus, type: CampaignType, boundHasTransactions: boolean): boolean {
  if (type !== "give" || !SWAP_STATUSES.includes(status)) return false
  return status !== "changes_requested" || boundHasTransactions
}

/** The organizer's pending request, if any (one per campaign). */
export function pendingSwap(requests: readonly AccountSwapRequest[]): AccountSwapRequest | null {
  return requests.find((r) => r.status === "pending") ?? null
}

/** The latest decided request, to tell the organizer how their last one ended. */
export function lastDecidedSwap(requests: readonly AccountSwapRequest[]): AccountSwapRequest | null {
  return requests.find((r) => r.status !== "pending") ?? null
}

/** Every swap request of one campaign, newest first (its organizer, or finance/admin staff). */
export async function listCampaignSwaps(db: Db, campaignId: string): Promise<AccountSwapRequest[]> {
  const { data, error } = await db
    .from("account_swap_requests")
    .select(SWAP_COLUMNS)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as AccountSwapRequest[]
}

/** Whether a binding recorded any bank transaction (its organizer, or finance/admin staff). */
export async function bindingHasTransactions(db: Db, bindingId: string): Promise<boolean> {
  const { data, error } = await db.from("bank_transactions").select("id").eq("binding_id", bindingId).limit(1)
  if (error) throw error
  return (data ?? []).length > 0
}

// ---------------------------------------------------------------------------
// Finance review
// ---------------------------------------------------------------------------

type SwapAccount = Pick<
  ReceivingAccount,
  | "id"
  | "owner_user_id"
  | "channel"
  | "bank_bin"
  | "account_number"
  | "account_name"
  | "verification_status"
  | "review_note"
>

export interface SwapForReview extends AccountSwapRequest {
  campaign: { id: string; slug: string; title: string; status: CampaignStatus; type: CampaignType } | null
  /** The requested account; its owner is the campaign's organizer (the RPCs require it). */
  new_account:
    | (SwapAccount & {
        organizer: {
          legal_name: string | null
          display_name: string | null
          verification_status: VerificationStatus
        } | null
      })
    | null
  old_binding: { id: string; bound_at: string; released_at: string | null; account: SwapAccount | null } | null
}

const ACCOUNT_FIELDS =
  "id, owner_user_id, channel, bank_bin, account_number, account_name, verification_status, review_note"

// authenticated may not read campaigns.organizer_id (20261101090000_give_campaign_read_hardening),
// so the organizer comes through the new account, whose owner it is. Two foreign
// keys point at account_bindings, so the old binding is named by its constraint.
export const REVIEW_COLUMNS = `${SWAP_COLUMNS},
  campaign:campaigns(id, slug, title, status, type),
  new_account:receiving_accounts(${ACCOUNT_FIELDS},
    organizer:organizers(legal_name, display_name, verification_status)),
  old_binding:account_bindings!account_swap_requests_old_binding_id_fkey(id, bound_at, released_at,
    account:receiving_accounts(${ACCOUNT_FIELDS}))`.replace(/\s+/g, " ")

/** Requests waiting for a decision, oldest first (finance/admin only under RLS). */
export async function listSwapsToReview(db: Db, limit = 100): Promise<SwapForReview[]> {
  const { data, error } = await db
    .from("account_swap_requests")
    .select(REVIEW_COLUMNS)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as unknown as SwapForReview[]
}

/** Decided requests, most recent first (finance/admin only under RLS). */
export async function listDecidedSwaps(db: Db, limit = 30): Promise<SwapForReview[]> {
  const { data, error } = await db
    .from("account_swap_requests")
    .select(REVIEW_COLUMNS)
    .neq("status", "pending")
    .order("decided_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as unknown as SwapForReview[]
}

/**
 * How many transactions each binding recorded, by binding id (finance/admin
 * staff). One count per binding: a row read would stop at PostgREST's row
 * cap and undercount.
 */
export async function transactionCounts(db: Db, bindingIds: readonly string[]): Promise<Map<string, number>> {
  const unique = [...new Set(bindingIds)]
  const counts = await Promise.all(
    unique.map(async (id) => {
      const { count, error } = await db
        .from("bank_transactions")
        .select("id", { count: "exact", head: true })
        .eq("binding_id", id)
      if (error) throw error
      return [id, count ?? 0] as const
    })
  )
  return new Map(counts)
}

/**
 * Why finance cannot approve a request as it stands, or null. Mirrors the
 * checks give.decide_account_swap repeats under its locks; the database stays
 * the authority.
 */
export function approvalBlock(swap: SwapForReview, oldBindingTransactions: number): string | null {
  const campaign = swap.campaign
  if (!campaign || campaign.type !== "give" || !SWAP_STATUSES.includes(campaign.status)) {
    return "Chiến dịch không còn ở trạng thái được đổi tài khoản (đang gây quỹ, tạm dừng, hoặc cần chỉnh sửa mà tài khoản đã có giao dịch)."
  }
  if (!swap.old_binding || swap.old_binding.released_at !== null) {
    return "Tài khoản đang gắn của chiến dịch đã thay đổi từ khi người tổ chức gửi yêu cầu."
  }
  if (campaign.status === "changes_requested" && oldBindingTransactions === 0) {
    return "Tài khoản cũ chưa nhận giao dịch nào: người tổ chức tự nhả và gắn tài khoản khác được, không cần đổi."
  }
  if (swap.new_account?.verification_status !== "verified") return "Tài khoản mới không còn ở trạng thái đã xác minh."
  if (swap.new_account.organizer?.verification_status !== "verified") return "Hồ sơ người tổ chức chưa được xác minh."
  return null
}

// ---------------------------------------------------------------------------
// Public notice
// ---------------------------------------------------------------------------

export interface PublicAccountChange {
  id: string
  campaign_id: string
  changed_at: string
  old_channel: ReceivingAccount["channel"]
  old_bank_bin: string | null
  old_chain: string | null
  old_account_masked: string | null
  new_channel: ReceivingAccount["channel"]
  new_bank_bin: string | null
  new_chain: string | null
  new_account_masked: string | null
  public_note: string | null
}

/** Approved account changes of a public campaign, oldest first (anyone may read them). */
export async function listPublicAccountChanges(db: Db, campaignId: string): Promise<PublicAccountChange[]> {
  const { data, error } = await db
    .from("public_account_changes")
    .select(
      "id, campaign_id, changed_at, old_channel, old_bank_bin, old_chain, old_account_masked, new_channel, new_bank_bin, new_chain, new_account_masked, public_note"
    )
    .eq("campaign_id", campaignId)
    .order("changed_at", { ascending: true })
  if (error) throw error
  return (data ?? []) as PublicAccountChange[]
}

/** "Vietcombank ••••0001", or the chain for a wallet; the view masks the number. */
function publicAccountLabel(channel: string, bankBin: string | null, chain: string | null, masked: string | null) {
  const where = channel === "crypto" ? (chain ?? "ví") : bankLabel(bankBin)
  return `${where} ${(masked ?? "").replace(/^\*+/, "••••")}`.trim()
}

/** One sentence for the public notice of an account change. */
export function describeAccountChange(change: PublicAccountChange): string {
  const from = publicAccountLabel(change.old_channel, change.old_bank_bin, change.old_chain, change.old_account_masked)
  const to = publicAccountLabel(change.new_channel, change.new_bank_bin, change.new_chain, change.new_account_masked)
  return `Từ ${formatDateTime(change.changed_at)}, chiến dịch nhận tiền vào tài khoản ${to} thay cho ${from}. Việc đổi do người tổ chức đề nghị và bộ phận tài chính của Give đã duyệt. Tiền đã vào tài khoản cũ trước thời điểm đó vẫn thuộc chiến dịch và vẫn có trong sao kê; tiền chuyển ra khỏi tài khoản cũ sau thời điểm đó cũng ghi là khoản chi của chiến dịch, cần người tổ chức giải trình.`
}
