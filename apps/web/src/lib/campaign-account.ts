import type { CampaignStatus, Db, Organizer } from "./campaigns"
import { getOrganizer } from "./campaigns"
import {
  accountUnusableReason,
  activeBinding,
  activeBindingsOfCampaign,
  campaignRefs,
  getAccount,
  isBindableStatus,
  listMyAccounts,
  type CampaignRef,
  type ReceivingAccount,
} from "./receiving-accounts"

/**
 * The receiving account as the campaign editor sees it (DOS/Give#32): which of
 * the organizer's accounts holds a give campaign, which ones it could take,
 * and whether the campaign may be sent for review.
 *
 * give.transition_campaign refuses draft -> in_review for a give campaign
 * without a usable account (GIVE_CAMPAIGN_NO_RECEIVING_ACCOUNT, DOS/Give#38);
 * the app checks first so the organizer gets a message that says what to do.
 */

/** Refusal when a give campaign is sent for review with no bound account. */
export const SUBMIT_NO_ACCOUNT =
  "Chưa gửi duyệt được: chiến dịch từ thiện cần gắn một tài khoản nhận tiền đã xác minh, đứng tên bạn. Chọn tài khoản trong mục Tài khoản nhận tiền của chiến dịch này; nếu bạn chưa có tài khoản đã xác minh, hãy khai báo và xác minh tại trang Tài khoản nhận tiền (/me/accounts)."

/** Refusal when the bound account can no longer receive money. */
export function submitUnusableAccount(reason: string): string {
  return `Chưa gửi duyệt được: tài khoản nhận tiền đang gắn không dùng được. ${reason} Hãy nhả tài khoản đó rồi gắn một tài khoản đã xác minh khác (quản lý tại trang Tài khoản nhận tiền, /me/accounts).`
}

/**
 * Why a give campaign cannot be sent for review because of its account, or
 * null when its bound account is usable. `bound` is the account the campaign's
 * active binding points at, or null when it has none.
 */
export function submitAccountProblem(
  bound: Pick<ReceivingAccount, "verification_status" | "account_name"> | null,
  organizer: Pick<Organizer, "legal_name" | "verification_status"> | null
): string | null {
  if (!bound) return SUBMIT_NO_ACCOUNT
  const unusable = accountUnusableReason(bound, organizer)
  return unusable ? submitUnusableAccount(unusable) : null
}

/**
 * The submit-path check: reads the campaign's active binding, its account and
 * the organizer with the caller's token (RLS shows the owner their own rows).
 * Throws on a read error, like the query helpers it calls.
 */
export async function checkSubmitAccount(db: Db, campaignId: string, organizerId: string): Promise<string | null> {
  const [bindings, organizer] = await Promise.all([
    activeBindingsOfCampaign(db, campaignId),
    getOrganizer(db, organizerId),
  ])
  if (bindings.length === 0) return SUBMIT_NO_ACCOUNT
  const account = await getAccount(db, bindings[0].receiving_account_id)
  return submitAccountProblem(account && account.owner_user_id === organizerId ? account : null, organizer)
}

export interface AccountChoice {
  account: ReceivingAccount
  /** Why this account cannot be bound to the campaign now, or null when it can. */
  blockedReason: string | null
}

/** The account the campaign's active binding holds, among the organizer's accounts. */
export function boundAccountOf(accounts: readonly ReceivingAccount[], campaignId: string): ReceivingAccount | null {
  return accounts.find((a) => activeBinding(a)?.campaign_id === campaignId) ?? null
}

/**
 * The organizer's other accounts for the editor's picker, usable ones first,
 * each with the reason it cannot be bound (still bound elsewhere, not
 * verified, or no longer matching the organizer).
 */
export function accountChoices(
  accounts: readonly ReceivingAccount[],
  campaignId: string,
  organizer: Pick<Organizer, "legal_name" | "verification_status"> | null,
  refs: ReadonlyMap<string, Pick<CampaignRef, "title">>
): AccountChoice[] {
  const choices = accounts
    .filter((account) => activeBinding(account)?.campaign_id !== campaignId)
    .map((account) => {
      const holder = activeBinding(account)
      let blockedReason: string | null = null
      if (account.verification_status !== "verified") {
        blockedReason =
          account.verification_status === "pending"
            ? "Tài khoản đang chờ xác minh."
            : "Tài khoản không dùng được (bị từ chối hoặc đã khóa)."
      } else if (holder) {
        const title = refs.get(holder.campaign_id)?.title
        blockedReason = title
          ? `Tài khoản đang gắn với chiến dịch "${title}". Mỗi tài khoản chỉ gắn với một chiến dịch; nhả nó ở trang Tài khoản nhận tiền nếu trạng thái chiến dịch kia cho phép.`
          : "Tài khoản đang gắn với một chiến dịch khác."
      } else {
        blockedReason = accountUnusableReason(account, organizer)
      }
      return { account, blockedReason }
    })
  return [...choices.filter((c) => !c.blockedReason), ...choices.filter((c) => c.blockedReason)]
}

/** Whether the editor offers the picker: the campaign may take an account and has none. */
export function canPickAccount(status: CampaignStatus, bound: ReceivingAccount | null): boolean {
  return isBindableStatus(status) && bound === null
}

export interface EditorAccounts {
  bound: ReceivingAccount | null
  /** Why the bound account cannot receive money, or null. */
  boundUnusable: string | null
  choices: AccountChoice[]
  /** Why the campaign cannot be sent for review because of its account, or null. */
  submitBlocked: string | null
}

/** Everything the editor shows about a give campaign's receiving account. */
export async function loadEditorAccounts(db: Db, organizerId: string, campaignId: string): Promise<EditorAccounts> {
  const [accounts, organizer] = await Promise.all([listMyAccounts(db, organizerId), getOrganizer(db, organizerId)])
  const bound = boundAccountOf(accounts, campaignId)
  const holders = accounts
    .map((a) => activeBinding(a)?.campaign_id)
    .filter((id): id is string => Boolean(id) && id !== campaignId)
  const refs = await campaignRefs(db, holders)
  return {
    bound,
    boundUnusable: bound ? accountUnusableReason(bound, organizer) : null,
    choices: accountChoices(accounts, campaignId, organizer, refs),
    submitBlocked: submitAccountProblem(bound, organizer),
  }
}
