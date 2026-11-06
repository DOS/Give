import type { PaymentAccount, PaymentContribution } from "@/server/contributions"

/**
 * Payment channels (docs/Give-Technical-Design.md section 5.1). Every channel
 * feeds the same pipeline: input -> give.inbound_events -> parse/normalize ->
 * money RPCs. Give never holds the money: a channel only tells the donor how
 * to pay the campaign's own account and mirrors what the bank reports.
 */

export type ChannelKind = "bank_api" | "payos" | "statement_import" | "crypto"

/** One transaction as a channel reports it, before it is staged or recorded. */
export interface NormalizedTx {
  /** Id the bank or channel gives the transaction; null when the format has none (section 5.2). */
  providerTxId: string | null
  direction: "in" | "out"
  /** "VND" for every M1 channel. */
  asset: string
  /** Whole units of `asset`, > 0. */
  amount: bigint
  /**
   * When the bank booked it. With `bookedDateOnly` the statement gives a date
   * and no time: `bookedAt` is any instant of that day in Asia/Ho_Chi_Minh
   * (usually its midnight) and no time of day is invented.
   */
  bookedAt: Date
  bookedDateOnly: boolean
  /** Transfer content as the bank wrote it, prefixes and all (the matcher searches inside it). */
  description: string | null
  counterpartyName?: string | null
  /** Counterparty account number; masked to its last four characters before it is stored. */
  counterpartyAccount?: string | null
  /** Running balance after this transaction, when the format has one. */
  balanceAfter?: bigint | null
  /** The source row (cells, original strings) for audit; a plain JSON object. */
  raw?: Record<string, unknown> | null
}

export interface PaymentInstruction {
  kind: "vietqr" | "checkout_url" | "crypto_address"
  vietqr?: {
    emvPayload: string
    bankBin: string
    accountNumber: string
    accountName: string
    amount: bigint
    addInfo: string
  }
  checkoutUrl?: string
  crypto?: { chain: string; address: string; asset: string; memo?: string }
  expiresAt?: Date
}

/** The account a donor pays into, as paymentAccount() returns it. */
export type InstructionAccount = PaymentAccount
/** The contribution being paid. */
export type InstructionContribution = Pick<PaymentContribution, "intended_amount" | "reference_code">

/**
 * A payment channel. Statement files are not parsed here: they carry a
 * period, balances and format flags that a list of transactions cannot, so
 * they go through `src/server/statement-parsers` and the statement-import
 * pipeline instead of a `parseStatement` method.
 */
export interface PaymentChannel {
  kind: ChannelKind
  buildInstruction(account: InstructionAccount, contribution: InstructionContribution): Promise<PaymentInstruction>
  /** Webhook: checks the signature FIRST, then returns the dedupe key and the normalized transactions. */
  parseWebhook?(req: Request, account?: InstructionAccount): Promise<{ dedupeKey: string; txs: NormalizedTx[] }>
  /** Active reconciliation. */
  fetchTransactions?(account: InstructionAccount, since: Date): Promise<NormalizedTx[]>
}
