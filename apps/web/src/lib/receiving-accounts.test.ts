import { describe, expect, it } from "vitest"

import { BANKS, bankByBin, bankLabel } from "./banks"
import {
  accountNameMatches,
  activeBinding,
  isBindableStatus,
  maskAccountNumber,
  normalizeAccountNumber,
  normalizePersonName,
  registerAccountSchema,
} from "./receiving-accounts"

describe("maskAccountNumber", () => {
  it("keeps only the last four characters", () => {
    expect(maskAccountNumber("0011012345678")).toBe("•••• 5678")
    expect(maskAccountNumber("12345")).toBe("•••• 2345")
  })

  it("hides short numbers entirely and handles missing ones", () => {
    expect(maskAccountNumber("1234")).toBe("••••")
    expect(maskAccountNumber(null)).toBe("—")
    expect(maskAccountNumber("")).toBe("—")
  })
})

describe("normalizePersonName and accountNameMatches", () => {
  it("drops Vietnamese diacritics, maps đ to D and upper-cases", () => {
    expect(normalizePersonName("Nguyễn Thị Đào")).toBe("NGUYEN THI DAO")
    expect(normalizePersonName("  trần   văn-a ")).toBe("TRAN VAN A")
  })

  it("matches a bank account name against a legal name with diacritics", () => {
    expect(accountNameMatches("NGUYEN THI DAO", "Nguyễn Thị Đào")).toBe(true)
    expect(accountNameMatches("NGUYEN THI DAO", "Nguyễn Thị Đào Hoa")).toBe(false)
  })

  it("never matches empty names", () => {
    expect(accountNameMatches("", "")).toBe(false)
    expect(accountNameMatches("!!", "??")).toBe(false)
    expect(accountNameMatches(null, undefined)).toBe(false)
  })
})

describe("normalizeAccountNumber", () => {
  it("removes spaces, dots and dashes and upper-cases", () => {
    expect(normalizeAccountNumber(" 0011 0123.456-78 ")).toBe("0011012345678")
    expect(normalizeAccountNumber("vn12ab")).toBe("VN12AB")
  })
})

describe("registerAccountSchema", () => {
  const valid = {
    bank_bin: "970436",
    account_number: "0011 0123 45678",
    account_name: " nguyen  thi dao ",
    account_kind: "standard",
    public_statement_url: "",
  }

  it("normalises a valid declaration", () => {
    expect(registerAccountSchema.parse(valid)).toEqual({
      bank_bin: "970436",
      account_number: "0011012345678",
      account_name: "NGUYEN THI DAO",
      account_kind: "standard",
      public_statement_url: null,
    })
  })

  it("accepts any bank from the list and rejects unknown BINs", () => {
    for (const bank of BANKS)
      expect(registerAccountSchema.safeParse({ ...valid, bank_bin: bank.bin }).success).toBe(true)
    expect(registerAccountSchema.safeParse({ ...valid, bank_bin: "123456" }).success).toBe(false)
    expect(registerAccountSchema.safeParse({ ...valid, bank_bin: "" }).success).toBe(false)
  })

  it("rejects account numbers the database would refuse", () => {
    expect(registerAccountSchema.safeParse({ ...valid, account_number: "123" }).success).toBe(false)
    expect(registerAccountSchema.safeParse({ ...valid, account_number: "1".repeat(20) }).success).toBe(false)
    expect(registerAccountSchema.safeParse({ ...valid, account_number: "12345#" }).success).toBe(false)
  })

  it("requires an https statement URL when one is given", () => {
    expect(registerAccountSchema.safeParse({ ...valid, public_statement_url: "http://bank.vn/x" }).success).toBe(false)
    expect(
      registerAccountSchema.parse({ ...valid, public_statement_url: "https://bank.vn/x" }).public_statement_url
    ).toBe("https://bank.vn/x")
  })

  it("rejects an unknown account kind", () => {
    expect(registerAccountSchema.safeParse({ ...valid, account_kind: "crypto" }).success).toBe(false)
  })
})

describe("banks", () => {
  it("has unique six-digit BINs", () => {
    const bins = BANKS.map((b) => b.bin)
    expect(new Set(bins).size).toBe(bins.length)
    for (const bin of bins) expect(bin).toMatch(/^[0-9]{6}$/)
  })

  it("looks up banks by BIN", () => {
    expect(bankByBin("970436")?.shortName).toBe("Vietcombank")
    expect(bankByBin("000000")).toBeNull()
    expect(bankLabel("000000")).toBe("000000")
    expect(bankLabel(null)).toBe("—")
  })
})

describe("binding helpers", () => {
  it("finds the active binding", () => {
    const released = { id: "a", campaign_id: "c1", bound_at: "2026-01-01", released_at: "2026-02-01" }
    const active = { id: "b", campaign_id: "c2", bound_at: "2026-03-01", released_at: null }
    expect(activeBinding({ bindings: [released, active] })).toBe(active)
    expect(activeBinding({ bindings: [released] })).toBeNull()
  })

  it("allows binding from submission on, never on a draft", () => {
    expect(isBindableStatus("draft")).toBe(false)
    expect(isBindableStatus("in_review")).toBe(true)
    expect(isBindableStatus("live")).toBe(true)
    expect(isBindableStatus("closed")).toBe(false)
  })
})
