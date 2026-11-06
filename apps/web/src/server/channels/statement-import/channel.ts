import "server-only"

import { buildDonationPayload, formatAmount } from "@/server/vietqr"

import type { InstructionAccount, InstructionContribution, PaymentChannel, PaymentInstruction } from "../types"

/**
 * The M1 default channel (design 5.2): the donor pays by a VietQR built here
 * (EMVCo/NAPAS, no outside service) and the money shows up when the
 * organizer or staff import the account's statement.
 */
export const statementImportChannel: PaymentChannel = {
  kind: "statement_import",

  async buildInstruction(
    account: InstructionAccount,
    contribution: InstructionContribution
  ): Promise<PaymentInstruction> {
    // PostgREST returns bigint columns as JSON numbers; formatAmount refuses
    // one that is not a safe positive integer (VIETQR_AMOUNT_INVALID).
    const amount = BigInt(formatAmount(contribution.intended_amount))
    const emvPayload = buildDonationPayload({
      bankBin: account.bank_bin,
      accountNumber: account.account_number,
      amount,
      addInfo: contribution.reference_code,
    })
    return {
      kind: "vietqr",
      vietqr: {
        emvPayload,
        bankBin: account.bank_bin,
        accountNumber: account.account_number,
        accountName: account.account_name,
        amount,
        addInfo: contribution.reference_code,
      },
    }
  },
}
