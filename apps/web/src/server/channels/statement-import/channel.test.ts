import { describe, expect, it } from "vitest"

import { paymentChannels } from "@/server/channels"
import { buildDonationPayload, hasValidCrc, VietQrError } from "@/server/vietqr"

import { statementImportChannel } from "./channel"

const ACCOUNT = { bank_bin: "970436", account_number: "0011004455667", account_name: "NGUYEN VAN A" }

describe("statementImportChannel", () => {
  it("is the M1 channel", () => {
    expect(paymentChannels).toEqual({ statement_import: statementImportChannel })
    expect(statementImportChannel.kind).toBe("statement_import")
  })

  it("builds a dynamic VietQR for the contribution's amount and reference code", async () => {
    const instruction = await statementImportChannel.buildInstruction(ACCOUNT, {
      intended_amount: 150000,
      reference_code: "GVABCDEF",
    })
    const emvPayload = buildDonationPayload({
      bankBin: "970436",
      accountNumber: "0011004455667",
      amount: 150000,
      addInfo: "GVABCDEF",
    })
    expect(instruction).toEqual({
      kind: "vietqr",
      vietqr: {
        emvPayload,
        bankBin: "970436",
        accountNumber: "0011004455667",
        accountName: "NGUYEN VAN A",
        amount: BigInt(150000),
        addInfo: "GVABCDEF",
      },
    })
    expect(hasValidCrc(emvPayload)).toBe(true)
    expect(emvPayload).toContain("5406150000")
    expect(emvPayload).toContain("0808GVABCDEF")
  })

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("refuses the amount %s", async (amount) => {
    await expect(
      statementImportChannel.buildInstruction(ACCOUNT, { intended_amount: amount, reference_code: "GVABCDEF" })
    ).rejects.toBeInstanceOf(VietQrError)
  })

  it("refuses a reference code the matcher would not find", async () => {
    await expect(
      statementImportChannel.buildInstruction(ACCOUNT, { intended_amount: 1000, reference_code: "GV0OIL1X" })
    ).rejects.toMatchObject({ code: "VIETQR_ADD_INFO_INVALID" })
  })
})
