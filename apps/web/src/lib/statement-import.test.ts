import { describe, expect, it } from "vitest"

import { fakeDb, op, type Call } from "@/test/fake-db"

import type { Db } from "./campaigns"
import {
  accountLabel,
  accountOwners,
  allowsNotATransaction,
  ambiguousReasonLabel,
  AMBIGUOUS_REASON_LABELS,
  AUDIT_ACTION_LABELS,
  countWaitingRows,
  getCandidateRows,
  getReviewSettings,
  importSummary,
  isOwnStatementRow,
  isVoidRow,
  listAccountBindings,
  listAmbiguousRows,
  listBatchRows,
  listDuplicateTargets,
  listReconciliationAudit,
  listTrustBlocks,
  listUploadAccounts,
  parseThresholdVnd,
  reconciliationAuditSummary,
  resolutionLabel,
  rowStatusLabel,
  uploadErrorMessage,
  withoutVoidCandidates,
  type AccountBindingView,
  type AmbiguousReason,
  type AuditEntry,
  type StatementRowView,
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
        "event_dismissed",
        "finance_review",
      ].sort()
    )
    expect(ambiguousReasonLabel("balance_break")).toContain("Số dư chạy")
    expect(ambiguousReasonLabel("event_dismissed")).toContain("không phải giao dịch thật")
    expect(ambiguousReasonLabel("event_dismissed")).not.toContain("chưa xử lý được ở đây")
    expect(ambiguousReasonLabel("something_new")).toBe("something_new")
    expect(rowStatusLabel("ambiguous")).toBe("Chờ nhân viên tài chính")
    expect(rowStatusLabel("not_a_transaction")).toBe("Không phải giao dịch, đã bỏ qua")
    expect(resolutionLabel("not_a_transaction")).toBe("Không phải giao dịch thật")
    expect(ambiguousReasonLabel("finance_review")).toContain("Chờ đội tài chính duyệt")
    expect(resolutionLabel("balance_confirmed")).toBe("Tự nhập: số dư đã khớp nhờ sao kê tải sau")
    expect(resolutionLabel(null)).toBe("—")
  })

  it("allows not_a_transaction only for dismissed (DOS/Give#78) and reviewed (DOS/Give#57) rows", () => {
    const reasons = Object.keys(AMBIGUOUS_REASON_LABELS) as AmbiguousReason[]
    expect(reasons.filter((reason) => allowsNotATransaction(reason))).toEqual(["event_dismissed", "finance_review"])
    expect(allowsNotATransaction(null)).toBe(false)
    expect(allowsNotATransaction(undefined)).toBe(false)
    expect(allowsNotATransaction("something_new")).toBe(false)
  })

  it("words upload refusals, with the row when one is at fault", () => {
    expect(uploadErrorMessage("STATEMENT_PARSER_UNKNOWN")).toBe("Định dạng sao kê này chưa được hỗ trợ.")
    expect(uploadErrorMessage("GIVE_IMPORT_ROW_INVALID", 7)).toBe(
      "Có một dòng giao dịch không hợp lệ (số tiền, ngày hoặc mã giao dịch) (dòng 7 của file)."
    )
    expect(uploadErrorMessage("GIVE_NOT_ALLOWED")).toBe("Bạn không có quyền thực hiện thao tác này.")
    expect(uploadErrorMessage("processing_failed")).toBe("Có lỗi xảy ra. Hãy thử lại sau.")
    // Not raised on this path today; worded in case it is (DOS/Give#148).
    expect(uploadErrorMessage("GIVE_ACCOUNT_OWNER_MISMATCH", 4)).toBe(
      "Tài khoản nhận không thuộc về người tổ chức của chiến dịch đang gắn, nên giao dịch này không xử lý được cho chiến dịch đó. Hãy báo đội ngũ Give qua email hi@give.vn để kiểm tra lại tài khoản nhận và chiến dịch (dòng 4 của file)."
    )
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

describe("countWaitingRows", () => {
  it("counts each batch's waiting rows exactly, without listing them", async () => {
    const calls: Call[] = []
    const db = fakeDb((call) => ({ count: op(call, "eq")?.[1] === "b1" ? 1200 : 0 }), calls) as unknown as Db
    const counts = await countWaitingRows(db, ["b1", "b2"])
    expect([...counts]).toEqual([
      ["b1", 1200],
      ["b2", 0],
    ])
    expect(op(calls[0], "select")).toEqual(["id", { count: "exact", head: true }])
    expect(calls[0].ops).toEqual(expect.arrayContaining([["eq", "status", "ambiguous"]]))
  })
})

describe("listAmbiguousRows", () => {
  it("lists the oldest waiting rows with their batch, and the total waiting", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({ data: [{ id: "r", amount: "50000", balance_after: "1000", batch: { id: "b" } }], count: 75 }),
      calls
    ) as unknown as Db
    const { rows, total } = await listAmbiguousRows(db, 1)
    expect(total).toBe(75)
    expect(rows[0]).toMatchObject({ amount: 50000, balance_after: 1000, batch: { id: "b" } })
    expect(String(op(calls[0], "select")?.[0])).toContain("batch:statement_import_batches(")
    expect(calls[0].ops).toEqual(
      expect.arrayContaining([
        ["eq", "status", "ambiguous"],
        ["limit", 1],
      ])
    )
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
  const ROW = { direction: "in" as const, amount: 50000, booked_at: "2026-10-15T00:00:00Z" }
  const tx = (id: string, day: number) => ({
    id,
    booked_at: new Date(Date.UTC(2026, 9, day)).toISOString(),
    amount: "50000",
  })

  /** Answers the three window queries (and the candidate lookup) the way PostgREST would over `all`. */
  function windowDb(all: ReturnType<typeof tx>[], calls: Call[] = [], extra?: ReturnType<typeof tx>) {
    return fakeDb((call) => {
      if (op(call, "maybeSingle")) return { data: extra ?? null }
      let rows = all.filter((t) =>
        call.ops.every(([name, column, value]) => {
          if (column !== "booked_at") return true
          if (name === "gte") return t.booked_at >= String(value)
          if (name === "lte") return t.booked_at <= String(value)
          if (name === "gt") return t.booked_at > String(value)
          return true
        })
      )
      if ((op(call, "select")?.[1] as { head?: boolean } | undefined)?.head) return { count: rows.length }
      const ascending = (op(call, "order")?.[1] as { ascending: boolean }).ascending
      rows = [...rows].sort((a, b) => (ascending ? 1 : -1) * a.booked_at.localeCompare(b.booked_at))
      return { data: rows.slice(0, op(call, "limit")?.[0] as number) }
    }, calls) as unknown as Db
  }

  it("shows the transactions closest to the row on both sides, and how many there are", async () => {
    // 60 transactions, one a day from 16 September to 14 November.
    const all = Array.from({ length: 60 }, (_, i) => tx(`t${i}`, i - 14))
    const targets = await listDuplicateTargets(windowDb(all), ROW, ACCOUNT)
    expect(targets.total).toBe(60)
    expect(targets.shown).toHaveLength(20)
    expect(targets.shown[0]).toMatchObject({ id: "t29", amount: 50000 })
    const days = targets.shown.map((t) => new Date(t.booked_at).getTime())
    const distance = (ms: number) => Math.abs(ms - Date.parse(ROW.booked_at))
    expect(Math.max(...days.map(distance))).toBeLessThanOrEqual(10 * 86_400_000)
  })

  it("always shows the transaction of the earlier row the queued row lines up with", async () => {
    const all = Array.from({ length: 60 }, (_, i) => tx(`t${i}`, i - 14))
    const calls: Call[] = []
    const targets = await listDuplicateTargets(windowDb(all, calls, all[0]), ROW, ACCOUNT, "t0")
    expect(targets.shown[0].id).toBe("t0")
    expect(targets.shown).toHaveLength(20)
    expect(targets.total).toBe(60)
    expect(calls.at(-1)?.ops).toEqual(
      expect.arrayContaining([
        ["eq", "id", "t0"],
        ["eq", "receiving_account_id", ACCOUNT],
      ])
    )
  })

  it("looks for the account's transactions of the same direction and amount around the row", async () => {
    const calls: Call[] = []
    await listDuplicateTargets(windowDb([], calls), ROW, ACCOUNT)
    for (const call of calls) {
      expect(call.ops).toEqual(
        expect.arrayContaining([
          ["eq", "receiving_account_id", ACCOUNT],
          ["eq", "direction", "in"],
          ["eq", "amount", 50000],
        ])
      )
    }
    expect(calls[2].ops).toEqual(
      expect.arrayContaining([
        ["gte", "booked_at", "2026-09-14T00:00:00.000Z"],
        ["lte", "booked_at", "2026-11-15T00:00:00.000Z"],
      ])
    )
  })
})

describe("listReconciliationAudit", () => {
  it("reads resolutions, manual matches and explanations of incoming money (DOS/Give#49)", async () => {
    const calls: Call[] = []
    await listReconciliationAudit(fakeDb(() => ({ data: [] }), calls) as unknown as Db)
    expect(calls[0].target).toBe("audit_log")
    expect(op(calls[0], "in")).toEqual([
      "action",
      [
        "statement_import_row.resolve",
        "bank_transaction.manual_match",
        "bank_transaction.explain_inbound",
        "bank_transaction.correct_explanation",
        "bank_transaction.return_explanation",
        "statement_import_row.balance_confirmed",
        "statement_review_settings.update",
        "campaign_statement_trust.restore",
      ],
    ])
    expect(AUDIT_ACTION_LABELS["bank_transaction.explain_inbound"]).toBe("Giải trình tiền vào không phải tiền ủng hộ")
  })

  it("formats audit entries including not_a_transaction resolutions (DOS/Give#78)", () => {
    const entry = (action: string, after: Record<string, unknown>): AuditEntry => ({
      id: 1,
      actor_id: USER,
      action,
      entity: "statement_import_rows",
      entity_id: "r1",
      before: null,
      after,
      created_at: "2026-11-14T08:05:00Z",
    })

    expect(
      reconciliationAuditSummary(
        entry("statement_import_row.resolve", {
          resolution: "not_a_transaction",
          bank_transaction_id: null,
          note: "File thử, không có trên VCB",
        })
      )
    ).toBe("Không phải giao dịch thật: File thử, không có trên VCB")

    expect(
      reconciliationAuditSummary(
        entry("statement_import_row.resolve", {
          resolution: "import",
          override_candidate: true,
          note: "Đã đối chiếu VCB",
        })
      )
    ).toBe("Nhập thành giao dịch mới (xác nhận khác dòng trước): Đã đối chiếu VCB")

    expect(
      reconciliationAuditSummary(
        entry("statement_import_row.resolve", {
          resolution: "duplicate",
          note: "Trùng FT9",
        })
      )
    ).toBe("Là giao dịch đã ghi: Trùng FT9")
  })

  it("shows a correction and a return of an explanation, so the audit never stops at the explanation", () => {
    const base = {
      id: 2,
      actor_id: USER,
      entity: "bank_transaction",
      entity_id: "t1",
      created_at: "2026-11-15T08:00:00Z",
    }
    expect(
      reconciliationAuditSummary({
        ...base,
        action: "bank_transaction.return_explanation",
        before: { bucket: "other_in", kind: "organizer_top_up" },
        after: { bucket: "unmatched_in", amount: 300000, reason: "Chị Mai xác nhận là tiền ủng hộ" },
      }).replace(/\u00a0/g, " ")
    ).toBe(
      '300.000 ₫ chuyển từ "không phải tiền ủng hộ" (Người tổ chức nạp thêm tiền) về "chưa khớp": Chị Mai xác nhận là tiền ủng hộ'
    )
    expect(
      reconciliationAuditSummary({
        ...base,
        action: "bank_transaction.correct_explanation",
        before: { bucket: "other_in" },
        after: { bucket: "received", amount: 150000, contribution_id: "c1", reason: "Biên lai" },
      }).replace(/\u00a0/g, " ")
    ).toBe('150.000 ₫ chuyển từ "không phải tiền ủng hộ" sang "đã khớp", lượt ủng hộ c1: Biên lai')
    expect(AUDIT_ACTION_LABELS["bank_transaction.return_explanation"]).toBe("Đưa giải trình về chưa khớp")
  })
})

// ---------------------------------------------------------------------------
// Void candidates (DOS/Give#78)
// ---------------------------------------------------------------------------

function stmtRow(id: string, patch: Partial<StatementRowView> = {}): StatementRowView {
  return {
    id,
    import_batch_id: "b",
    row_no: 1,
    booked_at: "2026-10-15T02:00:00.000Z",
    booked_date_only: false,
    direction: "in",
    amount: 100000,
    description: null,
    counterparty_name: null,
    counterparty_account_masked: null,
    balance_after: null,
    provider_tx_id: null,
    status: "imported",
    ambiguous_reason: null,
    bank_transaction_id: null,
    duplicate_of_row_id: null,
    candidate_row_id: null,
    resolution: null,
    resolved_at: null,
    resolution_note: null,
    ...patch,
  }
}

describe("void rows", () => {
  const voided = stmtRow("v", { status: "not_a_transaction", resolution: "not_a_transaction" })
  const rows = new Map([["v", voided]])

  it("a row resolved as not a transaction, or a staged duplicate of one, is void", () => {
    expect(isVoidRow(voided, rows)).toBe(true)
    expect(isVoidRow(stmtRow("d", { status: "duplicate", duplicate_of_row_id: "v" }), rows)).toBe(true)
  })

  it("an imported row, a waiting row, or a duplicate of a real row is not", () => {
    const real = new Map([["r", stmtRow("r")]])
    expect(isVoidRow(stmtRow("r"), real)).toBe(false)
    expect(isVoidRow(stmtRow("a", { status: "ambiguous", ambiguous_reason: "event_dismissed" }), real)).toBe(false)
    expect(isVoidRow(stmtRow("d", { status: "duplicate", duplicate_of_row_id: "r" }), real)).toBe(false)
  })

  it("the queue offers no void candidate and keeps every other", () => {
    const candidates = new Map([
      ["v", voided],
      ["d", stmtRow("d", { status: "duplicate", duplicate_of_row_id: "v" })],
      ["r", stmtRow("r", { bank_transaction_id: "tx" })],
    ])
    expect([...withoutVoidCandidates(candidates, rows).keys()]).toEqual(["r"])
  })

  it("reads the candidates and the rows their duplicates point at, and names the void ones", async () => {
    const calls: Call[] = []
    const db = fakeDb((call) => {
      const ids = op(call, "in")?.[1] as string[]
      if (ids.includes("c1")) {
        return {
          data: [
            { ...stmtRow("c1", { status: "not_a_transaction" }), amount: "100000" },
            { ...stmtRow("c2", { status: "duplicate", duplicate_of_row_id: "root" }), amount: "100000" },
            { ...stmtRow("c3", { status: "imported", bank_transaction_id: "tx" }), amount: "100000" },
          ],
        }
      }
      return { data: [stmtRow("root", { status: "not_a_transaction" })] }
    }, calls) as unknown as Db
    const { rows: shown, voidIds } = await getCandidateRows(db, ["c1", "c2", "c3", "c1"])
    expect([...shown.keys()]).toEqual(["c3"])
    expect(shown.get("c3")?.amount).toBe(100000)
    expect([...voidIds].sort()).toEqual(["c1", "c2"])
    expect(op(calls[0], "in")).toEqual(["id", ["c1", "c2", "c3"]])
    expect(op(calls[1], "in")).toEqual(["id", ["root"]])
  })

  it("reads nothing when no queued row has a candidate", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: [] }), calls) as unknown as Db
    expect(await getCandidateRows(db, [])).toEqual({ rows: new Map(), voidIds: new Set() })
    expect(calls).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Self-review (DOS/Give#78): the same rule as give.resolve_statement_import_row
// ---------------------------------------------------------------------------

describe("isOwnStatementRow", () => {
  const ME = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
  const row = (booked_at: string, patch: Partial<StatementRowView> = {}) =>
    ({ booked_at, booked_date_only: false, direction: "in", ...patch }) as const
  const binding = (patch: Partial<AccountBindingView>): AccountBindingView => ({
    receiving_account_id: ACCOUNT,
    bound_at: "2026-09-01T00:00:00+07:00",
    released_at: null,
    organizer_id: ME,
    ...patch,
  })
  const owners = new Map([[ACCOUNT, OTHER]])

  it("the account's owner", () => {
    expect(isOwnStatementRow(row("2026-10-15T09:00:00+07:00"), ACCOUNT, ME, new Map([[ACCOUNT, ME]]), [])).toBe(true)
    expect(isOwnStatementRow(row("2026-10-15T09:00:00+07:00"), ACCOUNT, ME, owners, [])).toBe(false)
  })

  it("the organizer of the campaign bound now, whenever the row was booked", () => {
    expect(isOwnStatementRow(row("2026-08-01T09:00:00+07:00"), ACCOUNT, ME, owners, [binding({})])).toBe(true)
    expect(
      isOwnStatementRow(row("2026-10-15T09:00:00+07:00"), ACCOUNT, ME, owners, [binding({ organizer_id: OTHER })])
    ).toBe(false)
    expect(
      isOwnStatementRow(row("2026-10-15T09:00:00+07:00"), ACCOUNT, ME, owners, [
        binding({ receiving_account_id: "another" }),
      ])
    ).toBe(false)
  })

  it("the organizer of a campaign bound when the row was booked, after the release", () => {
    const past = [binding({ released_at: "2026-10-20T00:00:00+07:00" })]
    expect(isOwnStatementRow(row("2026-10-15T09:00:00+07:00"), ACCOUNT, ME, owners, past)).toBe(true)
    expect(isOwnStatementRow(row("2026-10-25T09:00:00+07:00"), ACCOUNT, ME, owners, past)).toBe(false)
  })

  it("on the binding day, a date-only row counts and a timed row before the binding does not", () => {
    const noon = [binding({ bound_at: "2026-10-10T12:00:00+07:00", released_at: "2026-10-12T00:00:00+07:00" })]
    expect(
      isOwnStatementRow(row("2026-10-10T00:00:00+07:00", { booked_date_only: true }), ACCOUNT, ME, owners, noon)
    ).toBe(true)
    expect(isOwnStatementRow(row("2026-10-10T09:00:00+07:00"), ACCOUNT, ME, owners, noon)).toBe(false)
  })

  it("an outgoing row after the binding ended, until another binding begins", () => {
    const ended = binding({ released_at: "2026-10-20T00:00:00+07:00" })
    const out = row("2026-10-26T09:00:00+07:00", { direction: "out" })
    expect(isOwnStatementRow(out, ACCOUNT, ME, owners, [ended])).toBe(true)
    const next = binding({ bound_at: "2026-10-22T00:00:00+07:00", organizer_id: OTHER })
    expect(isOwnStatementRow(out, ACCOUNT, ME, owners, [ended, next])).toBe(false)
    expect(isOwnStatementRow(row("2026-10-26T09:00:00+07:00"), ACCOUNT, ME, owners, [ended])).toBe(false)
  })
})

describe("account owners and bindings", () => {
  it("reads each account's owner once", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: [{ id: ACCOUNT, owner_user_id: USER }] }), calls) as unknown as Db
    expect([...(await accountOwners(db, [ACCOUNT, ACCOUNT]))]).toEqual([[ACCOUNT, USER]])
    expect(op(calls[0], "in")).toEqual(["id", [ACCOUNT]])
  })

  it("reads every binding of the accounts, and the organizers through managed_campaigns", async () => {
    const calls: Call[] = []
    const db = fakeDb((call) => {
      if (call.target === "account_bindings") {
        return {
          data: [
            { receiving_account_id: ACCOUNT, campaign_id: "c1", bound_at: "a", released_at: null },
            { receiving_account_id: ACCOUNT, campaign_id: "c2", bound_at: "b", released_at: "c" },
          ],
        }
      }
      return { data: [{ id: "c1", organizer_id: USER }] }
    }, calls) as unknown as Db
    expect(await listAccountBindings(db, [ACCOUNT])).toEqual([
      { receiving_account_id: ACCOUNT, bound_at: "a", released_at: null, organizer_id: USER },
      { receiving_account_id: ACCOUNT, bound_at: "b", released_at: "c", organizer_id: null },
    ])
    // authenticated may not read campaigns.organizer_id: never embed it.
    expect(String(op(calls[0], "select")?.[0])).not.toContain("campaigns")
    expect(calls[0].ops).not.toEqual(expect.arrayContaining([["is", "released_at", null]]))
    expect(calls[1].target).toBe("rpc:managed_campaigns")
    expect(op(calls[1], "in")).toEqual(["id", ["c1", "c2"]])
    expect(await listAccountBindings(db, [])).toEqual([])
    expect(calls).toHaveLength(2)
  })
})

describe("finance review threshold (DOS/Give#57)", () => {
  it("reads the threshold and the daily limit every signed-in user may read", async () => {
    const calls: Call[] = []
    const db = fakeDb(
      () => ({ data: { threshold_vnd: 20000000, daily_limit_vnd: "100000000" } }),
      calls
    ) as unknown as Db
    expect(await getReviewSettings(db)).toEqual({ thresholdVnd: 20000000, dailyLimitVnd: 100000000 })
    expect(calls[0].target).toBe("statement_review_settings")
    expect(op(calls[0], "select")).toEqual(["threshold_vnd, daily_limit_vnd"])
  })

  it("gives null rather than a wrong amount when the setting cannot be read", async () => {
    expect(await getReviewSettings(fakeDb(() => ({ error: { code: "42P01" } })) as unknown as Db)).toBeNull()
    expect(await getReviewSettings(fakeDb(() => ({ data: null })) as unknown as Db)).toBeNull()
    expect(
      await getReviewSettings(fakeDb(() => ({ data: { threshold_vnd: 1, daily_limit_vnd: null } })) as unknown as Db)
    ).toBeNull()
  })

  it.each<[string, number | null]>([
    ["20000000", 20000000],
    [" 20.000.000 ", 20000000],
    ["20,000,000", 20000000],
    ["20 000 000", 20000000],
    ["20.000.000đ", 20000000],
    ["20.000.000 VND", 20000000],
    ["1", 1],
    ["9999999999999", 9999999999999],
    ["0", null],
    ["1,5", null],
    ["20.000,000", null],
    ["2.00.000", null],
    ["-1", null],
    ["10000000000000", null],
    ["", null],
    ["20tr", null],
  ])("reads %j as %s", (text, value) => {
    expect(parseThresholdVnd(text)).toBe(value)
  })

  it("summarises the audit entries of a confirmed gap and a threshold change", () => {
    const base = { id: 1, actor_id: null, entity: "x", entity_id: "y", created_at: "2026-11-18T00:00:00Z" }
    expect(
      reconciliationAuditSummary({
        ...base,
        action: "statement_import_row.balance_confirmed",
        before: { row_no: 3, reason: "balance_break" },
        after: { confirmed_by_batch_no: 12 },
      })
    ).toContain("lần tải #12")
    expect(
      reconciliationAuditSummary({
        ...base,
        action: "statement_review_settings.update",
        before: { threshold_vnd: 20000000 },
        after: { threshold_vnd: 30000000, note: "PO" },
      })
    ).toMatch(/^Ngưỡng duyệt từ .*20\.000\.000.* thành .*30\.000\.000.*: PO$/)
    expect(
      reconciliationAuditSummary({
        ...base,
        entity_id: "daily_limit_vnd",
        action: "statement_review_settings.update",
        before: { daily_limit_vnd: 100000000 },
        after: { daily_limit_vnd: 40000000, note: "JOY" },
      })
    ).toMatch(/^Giới hạn mỗi ngày từ .*100\.000\.000.* thành .*40\.000\.000.*: JOY$/)
  })
})

describe("listTrustBlocks (DOS/Give#57)", () => {
  it("reads the blocked campaigns through give.statement_trust_blocks", async () => {
    const calls: Call[] = []
    const row = {
      campaign_id: "c",
      slug: "s",
      title: "t",
      rejected: "2",
      last_rejected_at: "2026-11-18T00:00:00Z",
      last_restored_at: null,
      last_rejected_row_id: "77777777-7777-4777-8777-000000000001",
    }
    const db = fakeDb(() => ({ data: [row] }), calls) as unknown as Db
    expect(await listTrustBlocks(db, "11111111-1111-4111-8111-111111111111")).toEqual([{ ...row, rejected: 2 }])
    expect(calls[0].target).toBe("rpc:statement_trust_blocks")
    expect(op(calls[0], "args")).toEqual([{ p_actor_id: "11111111-1111-4111-8111-111111111111" }])
  })

  it("gives null, not an empty list, when the list cannot be read", async () => {
    const failing = fakeDb(() => ({ error: { code: "PGRST202" } })) as unknown as Db
    expect(await listTrustBlocks(failing, "11111111-1111-4111-8111-111111111111")).toBeNull()
  })
})
