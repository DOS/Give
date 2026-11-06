import { describe, expect, it } from "vitest"

import { fakeDb, op, type Call } from "@/test/fake-db"

import type { Db } from "./campaigns"
import { listParkedInbound, parkedReasonLabel, PARKED_PAGE, statementEventRef } from "./inbound"

const ACCOUNT = "11111111-1111-4111-8111-111111111111"
const SHA = "ab".repeat(32)

describe("statementEventRef", () => {
  it("reads the account and part of a statement upload's key", () => {
    expect(statementEventRef(`v1:${ACCOUNT}:${SHA}`)).toEqual({ accountId: ACCOUNT, part: null })
    expect(statementEventRef(`v1:${ACCOUNT}:${SHA}:part2of5:2026-09-22..2026-09-23`)).toEqual({
      accountId: ACCOUNT,
      part: { number: 2, count: 5 },
    })
  })

  it("ignores keys of other shapes", () => {
    expect(statementEventRef("payos:12345")).toBeNull()
    expect(statementEventRef(`v1:${ACCOUNT}:${SHA}:extra`)).toBeNull()
    expect(statementEventRef(`v1:${ACCOUNT}:${SHA}:part2of5`)).toBeNull()
    expect(statementEventRef(`v2:${ACCOUNT}:${SHA}`)).toBeNull()
  })
})

describe("parkedReasonLabel", () => {
  it("words the codes the inbound processing stores", () => {
    expect(parkedReasonLabel("processing_timeout")).toContain("quá thời gian")
    expect(parkedReasonLabel("processing_unfinished; before: processing_timeout")).toContain("không kết thúc")
    expect(parkedReasonLabel("GIVE_NOT_ALLOWED")).toContain("không còn quyền")
    expect(parkedReasonLabel("STATEMENT_PAYLOAD_INVALID")).toContain("Tải lại đúng file")
    expect(parkedReasonLabel("STATEMENT_PART_WAITING")).toContain("Phần trước")
    expect(parkedReasonLabel(null)).toBe("Không có mã lỗi.")
    expect(parkedReasonLabel("something_else")).toBe("Lỗi khác.")
  })
})

describe("listParkedInbound", () => {
  it("reads the parked view oldest first, without payloads", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: [{ id: "e1" }], count: 3 }), calls) as unknown as Db
    expect(await listParkedInbound(db)).toEqual({ events: [{ id: "e1" }], total: 3 })
    expect(calls[0].target).toBe("parked_inbound_events")
    expect(String(op(calls[0], "select")?.[0])).not.toContain("payload")
    expect(op(calls[0], "order")).toEqual(["parked_at", { ascending: true }])
    expect(op(calls[0], "limit")).toEqual([PARKED_PAGE])
  })
})
