import { bindingHasTransactions, listCampaignSwaps, SWAP_STATUSES, type AccountSwapRequest } from "./account-swaps"
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

/**
 * Refusal when the bound account can no longer receive money. An account that
 * already recorded a bank transaction holds the campaign's money history and
 * is never released early (GIVE_BINDING_NOT_RELEASABLE), so the organizer
 * asks finance to swap it instead (DOS/Give#55, #77).
 */
export function submitUnusableAccount(reason: string, boundHasTransactions = false): string {
  return boundHasTransactions
    ? `Chưa gửi duyệt được: tài khoản nhận tiền đang gắn không dùng được. ${reason} Tài khoản này đã nhận giao dịch nên không nhả được; hãy gửi yêu cầu đổi tài khoản trong mục Tài khoản nhận tiền của chiến dịch để bộ phận tài chính duyệt.`
    : `Chưa gửi duyệt được: tài khoản nhận tiền đang gắn không dùng được. ${reason} Hãy nhả tài khoản đó rồi gắn một tài khoản đã xác minh khác (quản lý tại trang Tài khoản nhận tiền, /me/accounts).`
}

/**
 * Why a give campaign cannot be sent for review because of its account, or
 * null when its bound account is usable. `bound` is the account the campaign's
 * active binding points at, or null when it has none.
 */
export function submitAccountProblem(
  bound: Pick<ReceivingAccount, "channel" | "verification_status" | "account_name"> | null,
  organizer: Pick<Organizer, "legal_name" | "verification_status"> | null,
  boundHasTransactions = false
): string | null {
  if (!bound) return SUBMIT_NO_ACCOUNT
  const unusable = accountUnusableReason(bound, organizer)
  return unusable ? submitUnusableAccount(unusable, boundHasTransactions) : null
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
  const bound = account && account.owner_user_id === organizerId ? account : null
  // Only an unusable account needs to know whether it holds money history.
  const hasTransactions =
    bound !== null && accountUnusableReason(bound, organizer) !== null
      ? await bindingHasTransactions(db, bindings[0].id)
      : false
  return submitAccountProblem(bound, organizer, hasTransactions)
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
  /** Whether the bound account recorded a bank transaction (money history: never released early). */
  boundHasTransactions: boolean
  /** The campaign's account swap requests, newest first (DOS/Give#55). */
  swaps: AccountSwapRequest[]
  choices: AccountChoice[]
  /** Why the campaign cannot be sent for review because of its account, or null. */
  submitBlocked: string | null
}

/**
 * Why the editor knows a give campaign has no usable receiving account (so an
 * approved one does not open): none bound, or the bound one unusable. Null
 * when it has one, or when the accounts could not be read.
 */
export function openingBlock(
  accounts: Pick<EditorAccounts, "bound" | "boundUnusable"> | null
): "no_account" | "unusable" | null {
  if (accounts === null) return null
  if (accounts.bound === null) return "no_account"
  return accounts.boundUnusable !== null ? "unusable" : null
}

/** Everything the editor shows about a give campaign's receiving account. */
export async function loadEditorAccounts(
  db: Db,
  organizerId: string,
  campaignId: string,
  status: CampaignStatus
): Promise<EditorAccounts> {
  const [accounts, organizer] = await Promise.all([listMyAccounts(db, organizerId), getOrganizer(db, organizerId)])
  const bound = boundAccountOf(accounts, campaignId)
  const holders = accounts
    .map((a) => activeBinding(a)?.campaign_id)
    .filter((id): id is string => Boolean(id) && id !== campaignId)
  const binding = bound ? activeBinding(bound) : null
  // Money history matters only to a campaign sent back for changes (release
  // or swap), and swaps only where a swap can happen (DOS/Give#55). A failed
  // read of either shows the section without them rather than hiding it; the
  // database refuses anything they would have prevented. An unknown money
  // history counts as some, so the editor offers the swap (which the database
  // turns into "release instead" if wrong) rather than a release it refuses.
  const [refs, boundHasTransactions, swaps] = await Promise.all([
    campaignRefs(db, holders),
    binding && status === "changes_requested"
      ? bindingHasTransactions(db, binding.id).catch(() => true)
      : Promise.resolve(false),
    SWAP_STATUSES.includes(status) ? listCampaignSwaps(db, campaignId).catch(() => []) : Promise.resolve([]),
  ])
  return {
    bound,
    boundUnusable: bound ? accountUnusableReason(bound, organizer) : null,
    boundHasTransactions,
    swaps,
    choices: accountChoices(accounts, campaignId, organizer, refs),
    submitBlocked: submitAccountProblem(bound, organizer, boundHasTransactions),
  }
}
