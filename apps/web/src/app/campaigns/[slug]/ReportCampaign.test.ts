// @vitest-environment happy-dom
/**
 * Unit and accessibility coverage for `ReportCampaign` (DOS/Give#234):
 * signed-in `ActionForm` fields/options/`aria-describedby`/`maxLength` and bound
 * action submission, signed-out encoded `return_path` login prompt, and the
 * disbursement-evidence link to `statementHref(slug, "out")`.
 */
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { REPORT_DETAILS_MAX, REPORT_REASON_LABELS, REPORT_REASONS } from "@/lib/campaign-reports"
import type { ActionResult } from "@/lib/errors"
import { statementHref } from "@/lib/statement"

const reportCampaignMock = vi.hoisted(() =>
  vi.fn<(campaignId: string, state: ActionResult, form: FormData) => Promise<ActionResult>>(async () => ({
    ok: true,
    message: "Cảm ơn bạn. Đội kiểm duyệt Give đã nhận báo cáo và sẽ xem xét chiến dịch này.",
  }))
)

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement("a", { href, ...rest }, children as never),
}))
vi.mock("./actions", () => ({ reportCampaign: reportCampaignMock }))

const { ReportCampaign } = await import("./ReportCampaign")

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const CAMPAIGN_ID = "33333333-3333-4333-8333-333333333333"
const SLUG = "xay-truong-ban-may"

let container: HTMLDivElement
let root: Root

function renderReport(props: Partial<{ campaignId: string; slug: string; signedIn: boolean }> = {}) {
  act(() => {
    root.render(
      createElement(ReportCampaign, {
        campaignId: CAMPAIGN_ID,
        slug: SLUG,
        signedIn: true,
        ...props,
      })
    )
  })
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  reportCampaignMock.mockClear()
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("ReportCampaign (DOS/Give#234)", () => {
  it("renders the signed-in report form with all reason options, accessible details hint, maxLength, and secondary submit button", () => {
    renderReport({ signedIn: true })

    const detailsEl = container.querySelector("details")!
    expect(detailsEl).toBeTruthy()
    const summary = detailsEl.querySelector("summary")!
    expect(summary.textContent).toContain("Báo cáo chiến dịch")
    expect(summary.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
    expect(detailsEl.querySelector('a[href^="/auth/login"]')).toBeNull()

    const select = detailsEl.querySelector<HTMLSelectElement>('select#report-reason[name="reason_code"]')!
    expect(select).toBeTruthy()
    expect(select.required).toBe(true)
    expect(select.value).toBe("")
    expect(detailsEl.querySelector('label[for="report-reason"]')?.textContent).toBe("Lý do báo cáo")

    const options = [...select.querySelectorAll("option")]
    expect(options[0]?.getAttribute("value")).toBe("")
    expect(options[0]?.disabled).toBe(true)
    expect(options[0]?.textContent).toBe("Chọn lý do…")
    expect(options.slice(1).map((opt) => opt.value)).toEqual([...REPORT_REASONS])
    expect(options.slice(1).map((opt) => opt.textContent)).toEqual(
      REPORT_REASONS.map((code) => REPORT_REASON_LABELS[code])
    )

    const textarea = detailsEl.querySelector<HTMLTextAreaElement>('textarea#report-details[name="details"]')!
    expect(textarea).toBeTruthy()
    expect(detailsEl.querySelector('label[for="report-details"]')?.textContent).toBe(
      "Chi tiết (bắt buộc nếu chọn “Lý do khác”)"
    )
    expect(textarea.getAttribute("aria-describedby")).toBe("report-details-hint")
    expect(textarea.getAttribute("maxlength")).toBe(String(REPORT_DETAILS_MAX))
    expect(textarea.maxLength).toBe(REPORT_DETAILS_MAX)
    expect(textarea.getAttribute("rows")).toBe("3")

    const hintMatches = detailsEl.querySelectorAll("#report-details-hint")
    expect(hintMatches).toHaveLength(1)
    expect(hintMatches[0].textContent).toBe(
      "Tối đa 1000 ký tự. Báo cáo được giữ kín; người tổ chức không biết ai báo cáo."
    )

    const submit = detailsEl.querySelector<HTMLButtonElement>('button[type="submit"]')!
    expect(submit).toBeTruthy()
    expect(submit.textContent).toBe("Gửi báo cáo")
    expect(submit.className).toContain("btn-secondary")
    expect(submit.className).toContain("w-full")
    expect(submit.className).not.toContain("btn-primary")

    const expectedStatementHref = statementHref(SLUG, "out")
    const statementLink = [...detailsEl.querySelectorAll("a")].find(
      (anchor) => anchor.getAttribute("href") === expectedStatementHref
    )
    expect(statementLink).toBeDefined()
    expect(statementLink?.textContent).toBe("sao kê khoản chi")
  })

  it("binds campaignId into ActionForm and submits the selected reason and details", async () => {
    renderReport({ signedIn: true })

    const form = container.querySelector("form")!
    const select = form.querySelector<HTMLSelectElement>('select[name="reason_code"]')!
    const textarea = form.querySelector<HTMLTextAreaElement>('textarea[name="details"]')!

    select.value = "other"
    textarea.value = "Thông tin người thụ hưởng không khớp chứng từ."

    await act(async () => {
      form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }))
    })

    expect(reportCampaignMock).toHaveBeenCalledTimes(1)
    const [boundCampaignId, prevState, submittedForm] = reportCampaignMock.mock.calls[0]
    expect(boundCampaignId).toBe(CAMPAIGN_ID)
    expect(prevState).toBeNull()
    expect(submittedForm.get("reason_code")).toBe("other")
    expect(submittedForm.get("details")).toBe("Thông tin người thụ hưởng không khớp chứng từ.")
    expect(form.querySelector('[role="status"]')?.textContent).toContain("Đội kiểm duyệt Give đã nhận báo cáo")
    expect(select.value).toBe("")
    expect(textarea.value).toBe("")
  })

  it("renders the encoded /auth/login?return_path=... prompt when signed out while keeping the disbursement statement link", () => {
    const specialSlug = "lop-hoc/ban may?dot=2&nam=2026"
    renderReport({ slug: specialSlug, signedIn: false })

    const detailsEl = container.querySelector("details")!
    expect(detailsEl.querySelector("form")).toBeNull()
    expect(detailsEl.querySelector('select[name="reason_code"]')).toBeNull()
    expect(detailsEl.querySelector('textarea[name="details"]')).toBeNull()
    expect(detailsEl.querySelector('button[type="submit"]')).toBeNull()

    const loginLink = detailsEl.querySelector<HTMLAnchorElement>('a[href^="/auth/login"]')!
    expect(loginLink).toBeTruthy()
    expect(loginLink.getAttribute("href")).toBe(
      `/auth/login?return_path=${encodeURIComponent(`/campaigns/${specialSlug}`)}`
    )
    expect(loginLink.textContent).toBe("Đăng nhập để báo cáo")
    expect(loginLink.className).toContain("btn-secondary")
    expect(loginLink.className).toContain("w-full")

    const expectedStatementHref = statementHref(specialSlug, "out")
    const statementLink = [...detailsEl.querySelectorAll("a")].find(
      (anchor) => anchor.getAttribute("href") === expectedStatementHref
    )
    expect(statementLink).toBeDefined()
    expect(statementLink?.textContent).toBe("sao kê khoản chi")
  })
})
