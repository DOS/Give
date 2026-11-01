import { beforeEach, describe, expect, it, vi } from "vitest"

import { fakeDb, op, type Call, type Handler } from "@/test/fake-db"

const USER = "11111111-1111-4111-8111-111111111111"
const OTHER = "99999999-9999-4999-8999-999999999999"
const CAMPAIGN = "22222222-2222-4222-8222-222222222222"
const TX = "33333333-3333-4333-8333-333333333333"
const CONTRIBUTION = "55555555-5555-4555-8555-555555555555"
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]

const state = vi.hoisted(() => ({
  userHandler: (() => undefined) as Handler,
  serviceHandler: (() => undefined) as Handler,
  userCalls: [] as Call[],
  serviceCalls: [] as Call[],
  signedIn: true,
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/auth/session", () => ({
  getSession: vi.fn(async () =>
    state.signedIn ? { user: { id: USER, email: null, name: null }, accessToken: "token" } : null
  ),
}))
vi.mock("@/lib/supabase", () => ({
  dbAs: () => fakeDb((call) => state.userHandler(call), state.userCalls),
  dbService: () => fakeDb((call) => state.serviceHandler(call), state.serviceCalls),
  MEDIA_BUCKET: "give-media",
}))
vi.mock("@/lib/media", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/media")>()),
  reencodeCover: vi.fn(async () => new Uint8Array([1, 2, 3])),
}))

const { addEvidence, explainDisbursement } = await import("./actions")

const campaign = { id: CAMPAIGN, organizer_id: USER, slug: "quy-a", title: "Quỹ A", status: "live" }
const tx = { id: TX, campaign_id: CAMPAIGN, amount: 300_000, asset: "VND", booked_at: "2026-11-01T02:00:00Z" }

/** An explained transaction's embedded explanation, with `n` evidence rows. */
const explained = (n = 0) => ({ purpose: "x", evidence: Array.from({ length: n }, (_, i) => ({ id: `e${i}` })) })

function reads({
  camp = campaign as unknown,
  outgoing = tx as unknown,
  disbursement = null as unknown,
  contribution = null as unknown,
  refunds = [] as unknown[],
  error = null as { code?: string; message?: string } | null,
} = {}): Handler {
  return (call) => {
    if (error) return { error }
    if (call.target === "rpc:managed_campaigns") return { data: camp }
    if (call.target === "bank_transactions")
      return { data: outgoing ? { ...(outgoing as object), disbursement } : null }
    if (call.target === "contributions") return { data: contribution }
    if (call.target === "ledger_entries") return { data: refunds }
    return undefined
  }
}

/** Service role: every uploaded path in an evidence lookup counts as recorded. */
const recordsAll: Handler = (call) =>
  call.target === "disbursement_evidence"
    ? { data: ((op(call, "in")?.[1] as string[]) ?? []).map((storage_path) => ({ storage_path })) }
    : undefined

function form(values: Record<string, string> = {}, files: File[] = []) {
  const f = new FormData()
  const all = {
    purpose: "Mua 200 bộ sách",
    category: "goods",
    recipient: "Nhà sách B",
    evidence_kind: "invoice",
    ...values,
  }
  for (const [k, v] of Object.entries(all)) f.set(k, v)
  for (const file of files) f.append("evidence", file)
  return f
}

const png = (name = "hoa-don.png", size = PNG.length) =>
  new File([new Uint8Array([...PNG, ...new Array(Math.max(0, size - PNG.length)).fill(0)])], name, {
    type: "image/png",
  })

const uploads = () => state.serviceCalls.filter((c) => c.target === "storage:give-media" && op(c, "upload"))
const removes = () => state.serviceCalls.filter((c) => c.target === "storage:give-media" && op(c, "remove"))
const rpc = (name: string) => state.serviceCalls.find((c) => c.target === `rpc:${name}`)

beforeEach(() => {
  state.userCalls.length = 0
  state.serviceCalls.length = 0
  state.signedIn = true
  state.userHandler = reads()
  state.serviceHandler = recordsAll
})

describe("explainDisbursement", () => {
  it("uploads the evidence and records the explanation as the verified user", async () => {
    const result = await explainDisbursement(CAMPAIGN, TX, null, form({}, [png()]))
    expect(result).toEqual({ ok: true, message: expect.stringContaining("Đã giải trình") })

    expect(uploads()).toHaveLength(1)
    const [path, , options] = op(uploads()[0], "upload")!
    expect(path).toMatch(new RegExp(`^disbursements/${CAMPAIGN}/${TX}/[0-9a-f-]{36}\\.webp$`))
    expect(options).toMatchObject({ contentType: "image/webp", upsert: false })

    expect(op(rpc("record_disbursement"), "args")?.[0]).toEqual({
      p_bank_transaction_id: TX,
      p_actor_id: USER,
      p_purpose: "Mua 200 bộ sách",
      p_category: "goods",
      p_recipient: "Nhà sách B",
      p_is_refund: false,
      p_refund_contribution_id: null,
      p_evidence: [{ storage_path: path, kind: "invoice" }],
    })
    // The user's token was used for every read before the service role acted.
    expect(state.userCalls.map((c) => c.target)).toEqual(
      expect.arrayContaining(["rpc:managed_campaigns", "bank_transactions"])
    )
    expect(removes()).toHaveLength(0)
  })

  it("removes images a repeated submission uploaded but the database did not record", async () => {
    // record_disbursement's replay path returns success without inserting evidence.
    state.serviceHandler = (call) => (call.target === "disbursement_evidence" ? { data: [] } : undefined)
    const result = await explainDisbursement(CAMPAIGN, TX, null, form({}, [png()]))
    expect(result?.message).toContain("đã được giải trình từ trước")
    expect(op(removes()[0], "remove")?.[0]).toEqual([op(uploads()[0], "upload")![0]])
  })

  it("keeps the uploads when the call failed without a database answer (it may have committed)", async () => {
    state.serviceHandler = (call) =>
      call.target === "rpc:record_disbursement"
        ? { error: { code: "", message: "TypeError: fetch failed" } }
        : undefined
    const result = await explainDisbursement(CAMPAIGN, TX, null, form({}, [png()]))
    expect(result).toEqual({ ok: false, message: "Có lỗi xảy ra. Hãy thử lại sau." })
    expect(removes()).toHaveLength(0)
  })

  it("records a refund to a contribution of the campaign", async () => {
    state.userHandler = reads({
      contribution: { id: CONTRIBUTION, reference_code: "GVABCDEF2", received_amount: 500_000 },
    })
    const result = await explainDisbursement(
      CAMPAIGN,
      TX,
      null,
      form({ category: "refund", refund_contribution_id: CONTRIBUTION })
    )
    expect(result?.ok).toBe(true)
    expect(op(rpc("record_disbursement"), "args")?.[0]).toMatchObject({
      p_is_refund: true,
      p_refund_contribution_id: CONTRIBUTION,
      p_evidence: [],
    })
  })

  it("refuses a refund larger than what is left to refund on the contribution", async () => {
    state.userHandler = reads({
      contribution: { id: CONTRIBUTION, reference_code: "GVABCDEF2", received_amount: 500_000 },
      refunds: [{ contribution_id: CONTRIBUTION, amount: 300_000 }],
    })
    const result = await explainDisbursement(
      CAMPAIGN,
      TX,
      null,
      form({ category: "refund", refund_contribution_id: CONTRIBUTION })
    )
    expect(result?.ok).toBe(false)
    expect(result?.message).toContain("GVABCDEF2")
    expect(result?.message).toContain("200.000")
    expect(rpc("record_disbursement")).toBeUndefined()
  })

  it("refuses a refund to a contribution outside the campaign", async () => {
    const result = await explainDisbursement(
      CAMPAIGN,
      TX,
      null,
      form({ category: "refund", refund_contribution_id: CONTRIBUTION })
    )
    expect(result).toEqual({ ok: false, message: expect.stringContaining("không thuộc chiến dịch") })
    expect(rpc("record_disbursement")).toBeUndefined()
  })

  it("stops when the campaign is someone else's, before any service-role call", async () => {
    state.userHandler = reads({ camp: { ...campaign, organizer_id: OTHER } })
    const result = await explainDisbursement(CAMPAIGN, TX, null, form({}, [png()]))
    expect(result?.ok).toBe(false)
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("stops when the token is rejected", async () => {
    state.userHandler = reads({ error: { code: "PGRST301", message: "JWT expired" } })
    const result = await explainDisbursement(CAMPAIGN, TX, null, form())
    expect(result).toEqual({ ok: false, message: "Phiên đăng nhập đã hết. Hãy đăng nhập lại." })
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("stops for a transaction that is not an outgoing one of this campaign", async () => {
    state.userHandler = reads({ outgoing: null })
    const result = await explainDisbursement(CAMPAIGN, TX, null, form())
    expect(result?.message).toContain("Không tìm thấy giao dịch")
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("refuses a second explanation", async () => {
    state.userHandler = reads({ disbursement: explained() })
    const result = await explainDisbursement(CAMPAIGN, TX, null, form())
    expect(result?.message).toContain("đã được giải trình")
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("rejects tampered ids, a signed-out user and invalid input", async () => {
    expect((await explainDisbursement("not-a-uuid", TX, null, form()))?.ok).toBe(false)
    expect((await explainDisbursement(CAMPAIGN, "../x", null, form()))?.ok).toBe(false)
    expect((await explainDisbursement(CAMPAIGN, TX, null, form({ purpose: "" })))?.message).toBe(
      "Ghi mục đích của khoản chi"
    )
    state.signedIn = false
    expect((await explainDisbursement(CAMPAIGN, TX, null, form()))?.message).toContain("đăng nhập")
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("rejects files that are not images, too many files or too many bytes", async () => {
    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "a.pdf", { type: "application/pdf" })
    expect((await explainDisbursement(CAMPAIGN, TX, null, form({}, [pdf])))?.message).toContain("JPEG, PNG hoặc WebP")
    const six = Array.from({ length: 6 }, (_, i) => png(`${i}.png`))
    expect((await explainDisbursement(CAMPAIGN, TX, null, form({}, six)))?.message).toContain("tối đa 5")
    const big = png("big.png", 4 * 1024 * 1024 + 1)
    expect((await explainDisbursement(CAMPAIGN, TX, null, form({}, [big])))?.message).toContain("4 MB")
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("removes the uploaded evidence when the database refuses", async () => {
    state.serviceHandler = (call) =>
      call.target === "rpc:record_disbursement"
        ? { error: { message: "GIVE_DISBURSEMENT_ALREADY_EXPLAINED" } }
        : undefined
    const result = await explainDisbursement(CAMPAIGN, TX, null, form({}, [png("a.png"), png("b.png")]))
    expect(result?.message).toContain("đã được giải trình")
    const uploaded = uploads().map((c) => op(c, "upload")![0])
    expect(uploaded).toHaveLength(2)
    expect(op(removes()[0], "remove")?.[0]).toEqual(uploaded)
  })

  it("removes a partial upload when storage fails midway", async () => {
    let n = 0
    state.serviceHandler = (call) =>
      op(call, "upload") && ++n === 2 ? { error: { message: "storage down" } } : undefined
    const result = await explainDisbursement(CAMPAIGN, TX, null, form({}, [png("a.png"), png("b.png")]))
    expect(result?.message).toContain("Không tải được")
    expect(op(removes()[0], "remove")?.[0]).toHaveLength(1)
    expect(rpc("record_disbursement")).toBeUndefined()
  })
})

describe("addEvidence", () => {
  it("adds images to an explained transaction", async () => {
    state.userHandler = reads({ disbursement: explained(1) })
    const result = await addEvidence(CAMPAIGN, TX, null, form({ evidence_kind: "photo" }, [png()]))
    expect(result).toEqual({ ok: true, message: "Đã thêm 1 ảnh chứng từ." })
    const args = op(rpc("add_disbursement_evidence"), "args")?.[0] as { p_actor_id: string; p_evidence: unknown[] }
    expect(args.p_actor_id).toBe(USER)
    expect(args.p_evidence).toEqual([{ storage_path: expect.stringMatching(/^disbursements\//), kind: "photo" }])
  })

  it("needs an explanation first and at least one image", async () => {
    expect((await addEvidence(CAMPAIGN, TX, null, form({}, [png()])))?.message).toContain("chưa được giải trình")
    state.userHandler = reads({ disbursement: explained() })
    expect((await addEvidence(CAMPAIGN, TX, null, form()))?.message).toContain("ít nhất một ảnh")
    state.userHandler = reads({ disbursement: explained(19) })
    expect((await addEvidence(CAMPAIGN, TX, null, form({}, [png("a.png"), png("b.png")])))?.message).toContain(
      "tối đa 20"
    )
    expect(state.serviceCalls).toHaveLength(0)
  })

  it("removes the upload when the database refuses", async () => {
    state.userHandler = reads({ disbursement: explained() })
    state.serviceHandler = (call) =>
      call.target === "rpc:add_disbursement_evidence" ? { error: { message: "GIVE_EVIDENCE_INVALID" } } : undefined
    const result = await addEvidence(CAMPAIGN, TX, null, form({}, [png()]))
    expect(result).toEqual({ ok: false, message: "Chứng từ không hợp lệ." })
    expect(removes()).toHaveLength(1)
  })
})
