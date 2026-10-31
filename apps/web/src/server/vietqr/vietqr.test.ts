import { describe, expect, it } from "vitest"

import {
  buildDonationPayload,
  consumerAccountInformation,
  crc16,
  DONATION_CODE_ALPHABET,
  encodeVietQr,
  formatAmount,
  hasValidCrc,
  isDonationCode,
  renderVietQrSvg,
  VietQrError,
} from "."

/*
 * Reference vectors.
 *
 * [NAPAS] "Tài liệu quy định định dạng mã VietQR trong dịch vụ chuyển nhanh
 * NAPAS247", version 1.0, NAPAS, 09/2021, section 6.1, published at
 * https://vietqr.net/portal-service/download/documents/QR_Format_T&C_v1.0_VN_092021.pdf
 * Each example gives the payload in the "Tạo mã QR" (create QR) step. Two
 * examples have errata in their headline payload, noted below; the vectors
 * use the step output, which the CRC in the document confirms.
 *
 * [EMVCo] EMV QR Code Specification for Payment Systems, Merchant-Presented
 * Mode, Appendix A example (merchant "BEST TRANSPORT", Beijing).
 */

// NAPAS 6.1.2: static QR to a card.
const NAPAS_STATIC_CARD =
  "00020101021138600010A00000072701300006970403011697040311012345670208QRIBFTTC53037045802VN63044F52"

// NAPAS 6.1.3: dynamic QR to an account, 180000 VND, bill number and purpose.
const NAPAS_DYNAMIC_ACCOUNT =
  "00020101021238570010A00000072701270006970403011300110123456780208QRIBFTTA530370454061800005802VN62340107NPS68690819thanh toan don hang63042E2E"

// NAPAS 6.1.4: dynamic QR to a card. The headline payload repeats 6.1.2 with
// CRC A203; the create-QR step shows the dynamic payload that CRC belongs to.
const NAPAS_DYNAMIC_CARD =
  "00020101021238600010A00000072701300006970403011697040311012345670208QRIBFTTC530370454061800005802VN62340107NPS68690819thanh toan don hang6304A203"

// NAPAS 6.1.1: static QR to an account, exactly as printed. The headline
// payload and the CRC step give the consumer ID sub-field as "0112" for a
// 13-character value, while the example's own field table shows "0113". The
// printed payload is not well formed, so it only checks the CRC.
const NAPAS_STATIC_ACCOUNT_AS_PRINTED =
  "00020101021138570010A00000072701270006970403011200110123456780208QRIBFTTA53037045802VN6304F4E5"

// NAPAS 5.2.3.2.4: the ID 38 template for a transfer to an account.
const NAPAS_ACCOUNT_TEMPLATE = "38570010A00000072701270006970468011300110099504460208QRIBFTTA"

const EMVCO_APPENDIX_A =
  "00020101021229300012D156000000000510A93FO3230Q31280012D15600000001030812345678520441115802CN5914BEST TRANSPORT6007BEIJING64200002ZH0104最佳运输0202北京540523.7253031565502016233030412340603***0708A60086670902ME91320016A0112233449988770708123456786304A13A"

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn()
  } catch (error) {
    if (error instanceof VietQrError) return error.code
    throw error
  }
  return undefined
}

describe("crc16", () => {
  it("matches the CRC-16/CCITT-FALSE check value", () => {
    expect(crc16("123456789")).toBe("29B1")
  })

  it("reproduces the CRC of every reference payload", () => {
    for (const payload of [
      NAPAS_STATIC_CARD,
      NAPAS_DYNAMIC_ACCOUNT,
      NAPAS_DYNAMIC_CARD,
      NAPAS_STATIC_ACCOUNT_AS_PRINTED,
      EMVCO_APPENDIX_A,
    ]) {
      expect(crc16(payload.slice(0, -4)), payload).toBe(payload.slice(-4))
      expect(hasValidCrc(payload), payload).toBe(true)
    }
  })

  it("runs over UTF-8 bytes", () => {
    // The EMVCo example has Chinese text; a CRC over UTF-16 code units would differ.
    expect(crc16(EMVCO_APPENDIX_A.slice(0, -4))).toBe("A13A")
  })

  it("rejects a payload whose CRC does not match", () => {
    expect(hasValidCrc(NAPAS_DYNAMIC_ACCOUNT.replace("180000", "190000"))).toBe(false)
    expect(hasValidCrc(NAPAS_DYNAMIC_ACCOUNT.slice(0, -1) + "F")).toBe(false)
    expect(hasValidCrc(NAPAS_DYNAMIC_ACCOUNT.toLowerCase())).toBe(false)
    expect(hasValidCrc("")).toBe(false)
  })
})

describe("encodeVietQr", () => {
  it("reproduces NAPAS 6.1.2, static QR to a card", () => {
    expect(encodeVietQr({ bankBin: "970403", consumerId: "9704031101234567", service: "card" })).toBe(NAPAS_STATIC_CARD)
  })

  it("reproduces NAPAS 6.1.3, dynamic QR to an account", () => {
    expect(
      encodeVietQr({
        bankBin: "970403",
        consumerId: "0011012345678",
        service: "account",
        amount: BigInt(180000),
        billNumber: "NPS6869",
        purpose: "thanh toan don hang",
      })
    ).toBe(NAPAS_DYNAMIC_ACCOUNT)
  })

  it("reproduces NAPAS 6.1.4, dynamic QR to a card", () => {
    expect(
      encodeVietQr({
        bankBin: "970403",
        consumerId: "9704031101234567",
        service: "card",
        amount: 180000,
        billNumber: "NPS6869",
        purpose: "thanh toan don hang",
      })
    ).toBe(NAPAS_DYNAMIC_CARD)
  })

  it("reproduces the NAPAS 5.2.3.2.4 account template", () => {
    expect(consumerAccountInformation("970468", "0011009950446", "account")).toBe(NAPAS_ACCOUNT_TEMPLATE)
  })

  it("rejects a malformed bank BIN or account", () => {
    for (const bankBin of ["", "97040", "9704030", "97040a", " 970403"]) {
      expect(
        codeOf(() => consumerAccountInformation(bankBin, "0011012345678", "account")),
        bankBin
      ).toBe("VIETQR_BANK_BIN_INVALID")
    }
    for (const consumerId of ["", "12345678901234567890", "0011 012345678", "001101234567-8", "0011012345678đ"]) {
      expect(
        codeOf(() => consumerAccountInformation("970403", consumerId, "account")),
        consumerId
      ).toBe("VIETQR_CONSUMER_ID_INVALID")
    }
  })

  it("rejects additional data that is too long or outside the EMV character set", () => {
    const base = { bankBin: "970403", consumerId: "0011012345678", service: "account" as const, amount: 1000 }
    for (const purpose of ["", "x".repeat(26), "thanh toán", "line\nbreak"]) {
      expect(
        codeOf(() => encodeVietQr({ ...base, purpose })),
        purpose
      ).toBe("VIETQR_TEXT_INVALID")
    }
    expect(codeOf(() => encodeVietQr({ ...base, billNumber: "x".repeat(26) }))).toBe("VIETQR_TEXT_INVALID")
    expect(encodeVietQr({ ...base, purpose: "x".repeat(25) })).toContain("0825" + "x".repeat(25))
  })
})

describe("formatAmount", () => {
  it("writes whole VND without separators", () => {
    expect(formatAmount(180000)).toBe("180000")
    expect(formatAmount(BigInt(1))).toBe("1")
    expect(formatAmount(BigInt("9999999999999"))).toBe("9999999999999")
  })

  it("rejects amounts that are not a positive whole number of at most 13 digits", () => {
    for (const amount of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
      BigInt(0),
      BigInt(-5),
      BigInt("10000000000000"),
    ]) {
      expect(
        codeOf(() => formatAmount(amount)),
        String(amount)
      ).toBe("VIETQR_AMOUNT_INVALID")
    }
    expect(codeOf(() => formatAmount("50000" as unknown as number))).toBe("VIETQR_AMOUNT_INVALID")
  })
})

describe("buildDonationPayload", () => {
  // Bank BIN and account from NAPAS 6.1.3.
  const input = { bankBin: "970403", accountNumber: "0011012345678", amount: BigInt(250000), addInfo: "GV7K2M9Q" }

  it("builds a dynamic account transfer with the code as the transfer content", () => {
    const payload = buildDonationPayload(input)
    expect(payload).toBe(
      "00020101021238570010A00000072701270006970403011300110123456780208QRIBFTTA530370454062500005802VN62120808GV7K2M9Q6304BD34"
    )
    expect(hasValidCrc(payload)).toBe(true)
  })

  it("accepts codes of the design format, within G3 and payOS limits", () => {
    expect(DONATION_CODE_ALPHABET).toHaveLength(31)
    expect(isDonationCode("GV23456Z")).toBe(true)
    expect(isDonationCode("GV7K2M9QX")).toBe(true)
    expect(buildDonationPayload({ ...input, addInfo: "GV7K2M9QX" })).toContain("0809GV7K2M9QX")
  })

  it("rejects reference codes outside the design format", () => {
    for (const addInfo of [
      "",
      "GV",
      "GV7K2M9",
      "GV7K2M9QXY",
      "GVABCD1234",
      "GV7K2M0Q",
      "GV7K2MOQ",
      "GV7K2M1Q",
      "GV7K2MIQ",
      "GV7K2MLQ",
      "gv7k2m9q",
      "Gv7K2M9Q",
      "7K2M9Q",
      "AB7K2M9Q",
      "GV 7K2M9Q",
      "GV7K-2M9Q",
      "GVĐ7K2M9",
      "GV7K2M9Q\n",
    ]) {
      expect(
        codeOf(() => buildDonationPayload({ ...input, addInfo })),
        JSON.stringify(addInfo)
      ).toBe("VIETQR_ADD_INFO_INVALID")
    }
    expect(isDonationCode(null)).toBe(false)
  })

  it("rejects invalid amounts, bank BINs and accounts", () => {
    expect(codeOf(() => buildDonationPayload({ ...input, amount: 0 }))).toBe("VIETQR_AMOUNT_INVALID")
    expect(codeOf(() => buildDonationPayload({ ...input, amount: -10000 }))).toBe("VIETQR_AMOUNT_INVALID")
    expect(codeOf(() => buildDonationPayload({ ...input, amount: 10000.5 }))).toBe("VIETQR_AMOUNT_INVALID")
    expect(codeOf(() => buildDonationPayload({ ...input, bankBin: "VCB" }))).toBe("VIETQR_BANK_BIN_INVALID")
    expect(codeOf(() => buildDonationPayload({ ...input, accountNumber: "" }))).toBe("VIETQR_CONSUMER_ID_INVALID")
  })
})

describe("renderVietQrSvg", () => {
  it("renders an SVG for a valid payload, the same every time", () => {
    const svg = renderVietQrSvg(NAPAS_DYNAMIC_ACCOUNT)
    expect(svg.startsWith("<svg")).toBe(true)
    expect(svg).toContain("</svg>")
    expect(renderVietQrSvg(NAPAS_DYNAMIC_ACCOUNT)).toBe(svg)
    expect(renderVietQrSvg(NAPAS_STATIC_CARD)).not.toBe(svg)
  })

  it("refuses a payload that is not VietQR or has a wrong CRC", () => {
    for (const payload of [
      "",
      "hello",
      NAPAS_DYNAMIC_ACCOUNT.replace("180000", "190000"),
      EMVCO_APPENDIX_A,
      "0002016304" + crc16("0002016304"),
    ]) {
      expect(
        codeOf(() => renderVietQrSvg(payload)),
        payload
      ).toBe("VIETQR_PAYLOAD_INVALID")
    }
  })
})
