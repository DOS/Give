// @vitest-environment happy-dom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

import { IMPACT_HIGHLIGHTS_MAX } from "@/lib/transparency"

import { ImpactReportSection } from "./ImpactReportSection"

const CAMPAIGN = "33333333-3333-4333-8333-333333333333"
const noopAction = vi.fn(async () => null)

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ""
})

describe("ImpactReportSection (DOS/Give#314)", () => {
  it("renders draft & publish controls for closed campaigns without a published report", () => {
    const html = renderToStaticMarkup(
      createElement(ImpactReportSection, {
        campaignStatus: "closed",
        action: noopAction,
        report: {
          campaign_id: CAMPAIGN,
          summary: "Bản nháp tổng kết",
          highlights: [{ label: "Học sinh", value: "120 em" }],
          published_at: null,
          created_at: "2026-11-20T08:00:00Z",
          updated_at: "2026-11-20T09:00:00Z",
        },
      })
    )
    expect(html).toContain("Bản nháp — chưa công khai")
    expect(html).toContain("Lưu bản nháp")
    expect(html).toContain("Công bố báo cáo")
    expect(html).toContain("120 em")
  })

  it("hides the revert-to-draft button once published", () => {
    const html = renderToStaticMarkup(
      createElement(ImpactReportSection, {
        campaignStatus: "succeeded",
        action: noopAction,
        report: {
          campaign_id: CAMPAIGN,
          summary: "Báo cáo chính thức",
          highlights: [],
          published_at: "2026-11-20T08:00:00Z",
          created_at: "2026-11-20T08:00:00Z",
          updated_at: "2026-11-20T08:00:00Z",
        },
      })
    )
    expect(html).toContain("Đã công bố")
    expect(html).toContain("Cập nhật báo cáo đã công bố")
    expect(html).not.toContain("Lưu bản nháp")
  })

  it("shows read-only notice and renders existing report content when campaign status is non-editable", () => {
    const html = renderToStaticMarkup(
      createElement(ImpactReportSection, {
        campaignStatus: "suspended",
        action: noopAction,
        report: {
          campaign_id: CAMPAIGN,
          summary: "## Kết quả\n\nĐã bàn giao **3 phòng học**.\n\n<script>alert(1)</script>",
          highlights: [{ label: "Phòng học", value: "3 phòng" }],
          published_at: "2026-11-20T08:00:00Z",
          created_at: "2026-11-20T08:00:00Z",
          updated_at: "2026-11-20T08:00:00Z",
        },
      })
    )
    expect(html).toContain("chế độ chỉ đọc")
    expect(html).not.toContain("<textarea")
    expect(html).toContain("Phòng học")
    expect(html).toContain("3 phòng")
    expect(html).toContain("3 phòng học")
    expect(html).not.toContain("<script>")
  })

  it("toggles Markdown preview with a hidden input instead of a hidden required textarea, and caps highlights at 10", () => {
    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        createElement(ImpactReportSection, {
          campaignStatus: "closed",
          action: noopAction,
          report: {
            campaign_id: CAMPAIGN,
            summary: "## Tổng kết\n\n**Hoàn thành**\n\n<script>alert(1)</script>",
            highlights: [{ label: "Học sinh", value: "120 em" }],
            published_at: null,
            created_at: "2026-11-20T08:00:00Z",
            updated_at: "2026-11-20T09:00:00Z",
          },
        })
      )
    })

    // Initially in edit mode: textarea visible, no hidden summary input.
    expect(container.querySelector("textarea#impact-summary")).not.toBeNull()
    expect(container.querySelector('input[type="hidden"][name="summary"]')).toBeNull()

    // Toggle to Markdown preview: textarea unmounted (not sr-only), hidden input preserves value.
    const previewBtn = [...container.querySelectorAll("button")].find((b) =>
      b.textContent?.includes("Xem trước Markdown")
    )!
    act(() => {
      previewBtn.click()
    })
    expect(container.querySelector("textarea")).toBeNull()
    const hiddenSummary = container.querySelector('input[type="hidden"][name="summary"]') as HTMLInputElement | null
    expect(hiddenSummary?.value).toContain("**Hoàn thành**")
    expect(container.innerHTML).toContain("<strong>Hoàn thành</strong>")
    expect(container.querySelector("script")).toBeNull()

    // Add highlights up to IMPACT_HIGHLIGHTS_MAX (10) -> add button disappears.
    for (let i = 1; i < IMPACT_HIGHLIGHTS_MAX; i += 1) {
      const addBtn = [...container.querySelectorAll("button")].find((b) =>
        b.textContent?.includes("Thêm chỉ số nổi bật")
      )
      expect(addBtn).toBeDefined()
      act(() => {
        addBtn!.click()
      })
    }
    expect(container.querySelectorAll('input[name="highlight_label"]')).toHaveLength(IMPACT_HIGHLIGHTS_MAX)
    expect(
      [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Thêm chỉ số nổi bật"))
    ).toBeUndefined()

    // Removing one row restores the add button.
    const removeBtn = container.querySelector('button[aria-label="Xóa chỉ số 1"]') as HTMLButtonElement
    act(() => {
      removeBtn.click()
    })
    expect(container.querySelectorAll('input[name="highlight_label"]')).toHaveLength(IMPACT_HIGHLIGHTS_MAX - 1)
    expect(
      [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Thêm chỉ số nổi bật"))
    ).toBeDefined()

    act(() => {
      root.unmount()
    })
  })

  it("asks window.confirm only for first-time publish and skips confirm for draft saves", async () => {
    const action = vi.fn(async () => ({ ok: true, message: "Đã lưu." }))
    const confirmSpy = vi.fn(() => false)
    const prevConfirm = window.confirm
    window.confirm = confirmSpy

    const container = document.createElement("div")
    document.body.appendChild(container)
    const root = createRoot(container)

    try {
      act(() => {
        root.render(
          createElement(ImpactReportSection, {
            campaignStatus: "closed",
            action,
            report: {
              campaign_id: CAMPAIGN,
              summary: "Nội dung báo cáo tổng kết",
              highlights: [],
              published_at: null,
              created_at: "2026-11-20T08:00:00Z",
              updated_at: "2026-11-20T09:00:00Z",
            },
          })
        )
      })

      const form = container.querySelector("form")!
      const draftBtn = container.querySelector('button[name="intent"][value="draft"]') as HTMLButtonElement
      const publishBtn = container.querySelector('button[name="intent"][value="publish"]') as HTMLButtonElement
      expect(draftBtn.dataset.confirm).toBeUndefined()
      expect(publishBtn.dataset.confirm).toContain("không thể chuyển lại thành bản nháp")

      // Clicking publish when user cancels confirm -> action is NOT called.
      await act(async () => {
        const ev = new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: publishBtn })
        form.dispatchEvent(ev)
      })
      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(action).not.toHaveBeenCalled()

      // Clicking draft -> confirm is NOT called, action runs.
      await act(async () => {
        const ev = new SubmitEvent("submit", { bubbles: true, cancelable: true, submitter: draftBtn })
        form.dispatchEvent(ev)
      })
      expect(confirmSpy).toHaveBeenCalledTimes(1)
      expect(action).toHaveBeenCalledTimes(1)
    } finally {
      window.confirm = prevConfirm
      act(() => {
        root.unmount()
      })
    }
  })
})
