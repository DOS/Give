import { z } from "zod"

import { bankByBin } from "./banks"
import type { CampaignStatus, Db, Organizer } from "./campaigns"

/**
 * Receiving accounts and their bindings to campaigns (design section 2.2;
 * DDL in DOS-Me `supabase/migrations/20261101100000_give_money_core_accounts.sql`).
 *
 * Reads run with the caller's token: RLS lets the owner see their own
 * accounts and finance/admin staff see all, and column grants keep the
 * credential id and verification evidence out of reach. Every select names
 * its columns, because a `select=*` on these tables fails.
 *
 * Writes go only through the money RPCs, which only the service role may
 * execute (see the server actions in app/me/accounts and app/admin/accounts).
 */

export type AccountStatus = "pending" | "verified" | "rejected" | "disabled"
export type AccountKind = "transparent_charity" | "standard"

export interface AccountBinding {
  id: string
  campaign_id: string
  bound_at: string
  released_at: string | null
}

export interface ReceivingAccount {
  id: string
  owner_user_id: string
  channel: "bank_api" | "payos" | "statement_import" | "crypto"
  bank_bin: string | null
  account_number: string | null
  account_name: string | null
  account_kind: AccountKind | null
  public_statement_url: string | null
  verification_status: AccountStatus
  verification_code: string
  review_note: string | null
  verified_at: string | null
  created_at: string
  updated_at: string
  bindings: AccountBinding[]
}

export interface AccountForReview extends ReceivingAccount {
  organizer: Pick<
    Organizer,
    "user_id" | "kind" | "legal_name" | "display_name" | "phone" | "verification_status"
  > | null
}

/** Columns authenticated may select (DOS-Me grants), with the bindings embedded. */
const ACCOUNT_COLUMNS = `id, owner_user_id, channel, bank_bin, account_number, account_name, account_kind,
  public_statement_url, verification_status, verification_code, review_note, verified_at, created_at, updated_at,
  bindings:account_bindings(id, campaign_id, bound_at, released_at)`.replace(/\s+/g, " ")

/**
 * The channel new bank accounts are registered on in M1: the organizer's
 * statements are imported. Bank API and PayOS come with later milestones.
 */
export const REGISTER_CHANNEL = "statement_import"

/**
 * The test transfer that proves the organizer controls the account (design
 * section 2.2, step 2): this amount, sent from the declared account with the
 * verification code as its content.
 */
export const VERIFICATION_TRANSFER_AMOUNT = 10_000

/**
 * Accounts an organizer may have waiting for verification at once, so one
 * person cannot squat many account numbers or flood the finance queue.
 * give.register_receiving_account enforces the same cap
 * (GIVE_TOO_MANY_PENDING_ACCOUNTS); the app checks first for a clearer message.
 */
export const MAX_PENDING_ACCOUNTS = 3

/** Staff roles that may read and review receiving accounts (RLS and give.review_receiving_account). */
export const FINANCE_ROLES = ["finance", "admin"] as const

/**
 * Statuses give.bind_receiving_account accepts. A draft may hold a binding so
 * the editor can require an account before submission; deleting the draft
 * deletes its binding.
 */
export const BINDABLE_STATUSES: readonly CampaignStatus[] = [
  "draft",
  "in_review",
  "changes_requested",
  "approved",
  "live",
]

export function isBindableStatus(status: CampaignStatus): boolean {
  return BINDABLE_STATUSES.includes(status)
}

/**
 * Campaign statuses for which the owner may ask give.release_account_binding
 * to free the account: a draft, or a give campaign sent back for changes,
 * at once when no transaction reached the account (to change its account), an ended
 * campaign once the database's terms hold (no transaction for a draft
 * cancelled without submission; otherwise 30 days and every transaction
 * matched or explained). The database decides and explains a refusal.
 */
export const RELEASE_STATUSES: readonly CampaignStatus[] = [
  "draft",
  "changes_requested",
  "cancelled",
  "closed",
  "failed",
  "succeeded",
]

export function canAskRelease(status: CampaignStatus | undefined): boolean {
  return status !== undefined && RELEASE_STATUSES.includes(status)
}

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  pending: "Chờ xác minh",
  verified: "Đã xác minh",
  rejected: "Bị từ chối",
  disabled: "Đã khóa",
}

export const ACCOUNT_KIND_LABELS: Record<AccountKind, string> = {
  transparent_charity: "Tài khoản từ thiện minh bạch (sao kê công khai)",
  standard: "Tài khoản thường, chỉ dùng cho gây quỹ",
}

/** The binding that currently holds the account, if any. */
export function activeBinding(account: Pick<ReceivingAccount, "bindings">): AccountBinding | null {
  return account.bindings.find((b) => b.released_at === null) ?? null
}

/**
 * Hides all but the last four characters: "0011012345678" -> "•••• 5678".
 * Account numbers are shown in full only to their owner and to finance staff.
 */
export function maskAccountNumber(number: string | null | undefined): string {
  if (!number) return "—"
  return number.length <= 4 ? "••••" : `•••• ${number.slice(-4)}`
}

/** The host of an organizer-supplied URL, so a reviewer can tell a bank's site from any other. */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return "?"
  }
}

/** Mirrors the normalisation in give.register_receiving_account. */
export function normalizeAccountNumber(input: string): string {
  return input.replace(/[\s.-]/g, "").toUpperCase()
}

/** Mirrors the normalisation in give.register_receiving_account. */
export function normalizeAccountName(input: string): string {
  return input.replace(/\s+/g, " ").trim().toUpperCase()
}

/**
 * Mirrors give.normalize_person_name: no diacritics, đ -> D, upper case,
 * anything else collapsed to single spaces.
 */
export function normalizePersonName(input: string | null | undefined): string {
  return (input ?? "")
    .replace(/[đĐ]/g, "D")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
}

/** Mirrors give.account_name_matches; the database stays the authority. */
export function accountNameMatches(accountName: string | null | undefined, legalName: string | null | undefined) {
  const account = normalizePersonName(accountName)
  return account !== "" && account === normalizePersonName(legalName)
}

type OrganizerIdentity = Pick<Organizer, "legal_name" | "verification_status"> | null | undefined

/**
 * Why an account cannot receive money or be bound right now, or null when it
 * can. Mirrors the checks in give.bind_receiving_account and
 * give.create_donation: a verified account stops being usable when the
 * organizer's verification resets or their legal name no longer matches.
 */
export function accountUnusableReason(
  account: Pick<ReceivingAccount, "verification_status" | "account_name">,
  organizer: OrganizerIdentity
): string | null {
  if (account.verification_status !== "verified") return "Tài khoản chưa được xác minh."
  if (organizer?.verification_status !== "verified") {
    return "Hồ sơ người tổ chức chưa được xác minh (hoặc cần xác minh lại sau khi đổi thông tin)."
  }
  if (!accountNameMatches(account.account_name, organizer.legal_name)) {
    return "Tên chủ tài khoản không còn trùng tên pháp lý trong hồ sơ người tổ chức."
  }
  return null
}

/** Why a campaign cannot take an account now, or null when it can. */
export function bindRefusalReason(status: CampaignStatus, hasAccount: boolean): string | null {
  if (!isBindableStatus(status)) return "trạng thái không cho gắn tài khoản"
  if (hasAccount) return "đã có tài khoản nhận"
  return null
}

export interface ReviewOptions {
  /** Why the verify button is off (the RPC would refuse), or null. */
  verifyBlocked: string | null
  /** The closing decision offered: rejecting frees the number, so an account ever bound can only be disabled. */
  close: "rejected" | "disabled" | null
  reopen: boolean
}

/** What a finance reviewer may do with an account, mirroring give.review_receiving_account. */
export function reviewOptions(
  account: Pick<ReceivingAccount, "verification_status" | "account_name" | "bindings">,
  organizer: OrganizerIdentity
): ReviewOptions {
  const status = account.verification_status
  let verifyBlocked: string | null = null
  if (status === "pending") {
    if (organizer?.verification_status !== "verified") {
      verifyBlocked = "Người tổ chức chưa được xác minh danh tính; xác minh hồ sơ trước."
    } else if (!accountNameMatches(account.account_name, organizer.legal_name)) {
      verifyBlocked = "Tên chủ tài khoản đã khai không trùng tên pháp lý hiện tại."
    }
  }
  return {
    verifyBlocked,
    close:
      status === "pending"
        ? account.bindings.length === 0
          ? "rejected"
          : "disabled"
        : status === "verified"
          ? "disabled"
          : null,
    reopen: status === "rejected" || status === "disabled",
  }
}

export const registerAccountSchema = z.object({
  bank_bin: z.string().refine((bin) => bankByBin(bin) !== null, "Chọn ngân hàng"),
  account_number: z
    .string()
    .transform(normalizeAccountNumber)
    .refine((v) => /^[0-9A-Z]{4,19}$/.test(v), "Số tài khoản gồm 4 đến 19 chữ số hoặc chữ cái"),
  account_name: z
    .string()
    .transform(normalizeAccountName)
    .refine((v) => v.length >= 2 && v.length <= 120, "Nhập tên chủ tài khoản đúng như trên ngân hàng"),
  account_kind: z.enum(["transparent_charity", "standard"], { message: "Chọn loại tài khoản" }),
  public_statement_url: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || (/^https:\/\/\S+$/.test(v) && v.length <= 500),
      "Đường dẫn sao kê phải bắt đầu bằng https://"
    )
    .transform((v) => (v === "" ? null : v)),
})

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** The caller's own accounts, newest first. */
export async function listMyAccounts(db: Db, userId: string): Promise<ReceivingAccount[]> {
  const { data, error } = await db
    .from("receiving_accounts")
    .select(ACCOUNT_COLUMNS)
    .eq("owner_user_id", userId)
    .order("created_at", { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as ReceivingAccount[]
}

/** How many of the caller's accounts are waiting for verification. */
export async function countPendingAccounts(db: Db, userId: string): Promise<number> {
  const { data, error } = await db
    .from("receiving_accounts")
    .select("id")
    .eq("owner_user_id", userId)
    .eq("verification_status", "pending")
  if (error) throw error
  return (data ?? []).length
}

/** One account the caller may read (its owner, or finance/admin staff). */
export async function getAccount(db: Db, id: string): Promise<ReceivingAccount | null> {
  const { data, error } = await db.from("receiving_accounts").select(ACCOUNT_COLUMNS).eq("id", id).maybeSingle()
  if (error) throw error
  return data as unknown as ReceivingAccount | null
}

const REVIEW_COLUMNS = `${ACCOUNT_COLUMNS}, organizer:organizers(user_id, kind, legal_name, display_name, phone, verification_status)`

/** Accounts waiting for verification, oldest first (finance/admin only under RLS). */
export async function listAccountsToReview(db: Db, limit = 100): Promise<AccountForReview[]> {
  const { data, error } = await db
    .from("receiving_accounts")
    .select(REVIEW_COLUMNS)
    .eq("verification_status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as unknown as AccountForReview[]
}

/** Reviewed accounts, most recently changed first (finance/admin only under RLS). */
export async function listReviewedAccounts(db: Db, limit = 50): Promise<AccountForReview[]> {
  const { data, error } = await db
    .from("receiving_accounts")
    .select(REVIEW_COLUMNS)
    .in("verification_status", ["verified", "rejected", "disabled"])
    .order("updated_at", { ascending: false })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as unknown as AccountForReview[]
}

export interface CampaignRef {
  id: string
  slug: string
  title: string
  status: CampaignStatus
}

/** Titles of campaigns that bindings point at, by id (columns open to every reader). */
export async function campaignRefs(db: Db, ids: readonly string[]): Promise<Map<string, CampaignRef>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const { data, error } = await db.from("campaigns").select("id, slug, title, status").in("id", unique)
  if (error) throw error
  return new Map(((data ?? []) as CampaignRef[]).map((c) => [c.id, c]))
}

/** Active bindings of one campaign (its organizer, or finance/admin staff). */
export async function activeBindingsOfCampaign(
  db: Db,
  campaignId: string
): Promise<{ id: string; receiving_account_id: string }[]> {
  const { data, error } = await db
    .from("account_bindings")
    .select("id, receiving_account_id")
    .eq("campaign_id", campaignId)
    .is("released_at", null)
  if (error) throw error
  return (data ?? []) as { id: string; receiving_account_id: string }[]
}
