import { describe, expect, it } from "vitest"

import { fakeDb, op, type Call } from "@/test/fake-db"

import type { Db } from "./campaigns"
import {
  accountLabel,
  ambiguousReasonLabel,
  AMBIGUOUS_REASON_LABELS,
  importSummary,
  listBatchRows,
  listDuplicateTargets,
  listUploadAccounts,
  rowStatusLabel,
  uploadErrorMessage,
} from "./statement-import"

const USER = "11111111-1111-4111-8111-111111111111"
const ACCOUNT = "33333333-3333-4333-8333-333333333333"

describe("labels", () => {
  it("words every ambiguous reason the database can give", () => {
    // statement_import_rows_reason_values in the DOS-Me migration.
    expect(Object.keys(AMBIGUOUS_REASON_LABELS).sort()).toEqual(
      [
        "provider_id_repeated",
        "provider_id_conflict",
        "overlap_mismatch",
        "group_without_balance",
        "format_without_identity",
        "balance_break",
        "file_mismatch",
        "possible_recorded",
      ].sort()
    )
    expect(ambiguousReasonLabel("balance_break")).toContain("Số dư chạy")
    expect(ambiguousReasonLabel("something_new")).toBe("something_new")
    expect(rowStatusLabel("ambiguous")).toBe("Chờ nhân viên tài chính")
  })

  it("words upload refusals, with the row when one is at fault", () => {
    expect(uploadErrorMessage("STATEMENT_PARSER_UNKNOWN")).toBe("Định dạng sao kê này chưa được hỗ trợ.")
    expect(uploadErrorMessage("GIVE_IMPORT_ROW_INVALID", 7)).toBe(
      "Có một dòng giao dịch không hợp lệ (số tiền, ngày hoặc mã giao dịch) (dòng 7 của file)."
    )
    expect(uploadErrorMessage("GIVE_NOT_ALLOWED")).toBe("Bạn không có quyền thực hiện thao tác này.")
    expect(uploadErrorMessage("processing_failed")).toBe("Có lỗi xảy ra. Hãy thử lại sau.")
  })

  it("sums up a batch", () => {
    expect(importSummary({ imported: 3, duplicate: 1, ambiguous: 0, ready: 0 })).toBe(
      "3 giao dịch được ghi, 1 dòng trùng đã bỏ qua"
    )
    expect(importSummary({ imported: 0, duplicate: 0, ambiguous: 2, ready: 1 })).toBe(
      "0 giao dịch được ghi, 0 dòng trùng đã bỏ qua, 2 dòng chờ nhân viên tài chính xem, 1 dòng chưa nhập xong"
    )
  })

  it("labels an account without its full number", () => {
    expect(accountLabel({ bank_bin: "970436", account_number: "0011012345678", account_name: "NGUYEN THI DAO" })).toBe(
      "Vietcombank · ****5678 · NGUYEN THI DAO"
    )
  })
})

describe("listUploadAccounts", () => {
  it("lists the caller's own statement accounts", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: [] }), calls) as unknown as Db
    await listUploadAccounts(db, USER, false)
    expect(calls[0].ops).toEqual(
      expect.arrayContaining([
        ["eq", "channel", "statement_import"],
        ["neq", "verification_status", "rejected"],
        ["eq", "owner_user_id", USER],
      ])
    )
  })

  it("adds every verified account for finance staff, own accounts first", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({
        data: [
          { id: "a", owner_user_id: "other", verification_status: "verified" },
          { id: "b", owner_user_id: USER, verification_status: "pending" },
        ],
      }),
      calls
    ) as unknown as Db
    const accounts = await listUploadAccounts(db, USER, true)
    expect(accounts.map((a) => a.id)).toEqual(["b", "a"])
    expect(op(calls[0], "or")).toEqual([`owner_user_id.eq.${USER},verification_status.eq.verified`])
  })
})

describe("listBatchRows", () => {
  it("reads every page of a batch in file order", async () => {
    const calls: Call[] = []
    let page = 0
    const db = fakeDb(() => {
      page += 1
      return {
        data: Array.from({ length: page === 1 ? 1000 : 2 }, (_, i) => ({
          row_no: i + 1,
          amount: "1000",
          balance_after: null,
        })),
      }
    }, calls) as unknown as Db
    const rows = await listBatchRows(db, "batch")
    expect(rows).toHaveLength(1002)
    expect(rows[0]).toMatchObject({ amount: 1000, balance_after: null })
    expect(calls.map((c) => op(c, "range"))).toEqual([
      [0, 999],
      [1000, 1999],
    ])
  })
})

describe("listDuplicateTargets", () => {
  it("looks for the account's transactions of the same direction and amount around the row", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: [] }), calls) as unknown as Db
    await listDuplicateTargets(db, { direction: "in", amount: 50000, booked_at: "2026-10-15T00:00:00Z" }, ACCOUNT)
    expect(calls[0].ops).toEqual(
      expect.arrayContaining([
        ["eq", "receiving_account_id", ACCOUNT],
        ["eq", "direction", "in"],
        ["eq", "amount", 50000],
        ["gte", "booked_at", "2026-09-14T00:00:00.000Z"],
        ["lte", "booked_at", "2026-11-15T00:00:00.000Z"],
      ])
    )
  })
})
