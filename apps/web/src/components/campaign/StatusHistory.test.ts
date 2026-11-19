// @vitest-environment happy-dom
/**
 * Covers `listStatusEventsByCampaign` and `<StatusHistory>` (DOS/Give#282):
 * explicit non-`actor_id` column selection, deduplication and 100-ID chunking,
 * `id DESC` ordering, error propagation for `.catch(() => new Map())` call
 * sites, null rendering on empty lists, contextualized `<details>` summary
 * (`Lịch sử trạng thái (N)` + `sr-only` `: <title>`), `STATUS_LABELS`
 * transitions, Vietnam timestamps, and multiline `max-w-[68ch]` `reason` text.
 */
import { Window } from "happy-dom"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { STATUS_LABELS, type CampaignStatus, type Db } from "@/lib/campaigns"
import { formatDateTime } from "@/lib/format"
import { fakeDb, op, type Call } from "@/test/fake-db"

import { listStatusEventsByCampaign, StatusHistory, type CampaignStatusEvent } from "./StatusHistory"

const CAMPAIGN_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const CAMPAIGN_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const ACTOR_UUID = "99999999-9999-4999-8999-999999999999"

function parseDoc(html: string) {
  const win = new Window()
  win.document.body.innerHTML = html
  return win.document
}

describe("listStatusEventsByCampaign (DOS/Give#282)", () => {
  it("returns an empty Map without querying the database when campaignIds is empty", async () => {
    const calls: Call[] = []
    const db = fakeDb(() => ({ data: [] }), calls) as unknown as Db

    const result = await listStatusEventsByCampaign(db, ["", ""])

    expect(result.size).toBe(0)
    expect(calls).toHaveLength(0)
  })

  it("queries explicit columns without actor_id, deduplicates IDs, orders by id DESC, and strips unexpected fields", async () => {
    const calls: Call[] = []
    const db = fakeDb((call) => {
      if (call.target === "campaign_status_events") {
        return {
          data: [
            {
              id: 14,
              campaign_id: CAMPAIGN_A,
              from_status: "changes_requested",
              to_status: "in_review",
              reason: "Đã bổ sung giấy xác nhận của địa phương.",
              created_at: "2026-11-18T04:30:00.000Z",
              actor_id: ACTOR_UUID,
            },
            {
              id: 9,
              campaign_id: CAMPAIGN_A,
              from_status: "in_review",
              to_status: "changes_requested",
              reason: "Thiếu mộc đỏ trên giấy xác nhận.",
              created_at: "2026-11-17T09:15:00.000Z",
              actor_id: ACTOR_UUID,
            },
            {
              id: 5,
              campaign_id: CAMPAIGN_B,
              from_status: "draft",
              to_status: "in_review",
              reason: null,
              created_at: "2026-11-16T02:00:00.000Z",
            },
          ],
        }
      }
      return undefined
    }, calls) as unknown as Db

    const map = await listStatusEventsByCampaign(db, [CAMPAIGN_A, CAMPAIGN_B, CAMPAIGN_A])

    expect(calls).toHaveLength(1)
    expect(calls[0]!.target).toBe("campaign_status_events")
    const selected = String(op(calls[0], "select")?.[0] ?? "")
    expect(selected).toBe("id, campaign_id, from_status, to_status, reason, created_at")
    expect(selected).not.toContain("actor_id")
    expect(selected).not.toContain("*")
    expect(op(calls[0], "in")).toEqual(["campaign_id", [CAMPAIGN_A, CAMPAIGN_B]])
    expect(op(calls[0], "order")).toEqual(["id", { ascending: false }])

    const aEvents = map.get(CAMPAIGN_A)!
    expect(aEvents.map((e) => e.id)).toEqual([14, 9])
    for (const event of aEvents) {
      expect("actor_id" in event).toBe(false)
      expect(JSON.stringify(event)).not.toContain(ACTOR_UUID)
    }
    expect(map.get(CAMPAIGN_B)?.map((e) => e.id)).toEqual([5])
  })

  it("chunks campaign IDs into batches of 100 and merges results across chunks", async () => {
    const ids = Array.from({ length: 205 }, (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`)
    const calls: Call[] = []
    const db = fakeDb((call) => {
      const chunk = (op(call, "in")?.[1] ?? []) as string[]
      return {
        data: [
          {
            id: chunk.length,
            campaign_id: chunk[0]!,
            from_status: "draft",
            to_status: "in_review",
            reason: null,
            created_at: "2026-11-18T00:00:00.000Z",
          },
        ],
      }
    }, calls) as unknown as Db

    const map = await listStatusEventsByCampaign(db, ids)

    expect(calls).toHaveLength(3)
    expect((op(calls[0], "in")?.[1] as string[]).length).toBe(100)
    expect((op(calls[1], "in")?.[1] as string[]).length).toBe(100)
    expect((op(calls[2], "in")?.[1] as string[]).length).toBe(5)
    expect(map.has(ids[0]!)).toBe(true)
    expect(map.has(ids[100]!)).toBe(true)
    expect(map.has(ids[200]!)).toBe(true)
  })

  it("throws when Supabase returns an error so call sites can recover via .catch(() => new Map())", async () => {
    const db = fakeDb(() => ({
      error: { code: "42501", message: "permission denied for table campaign_status_events" },
    })) as unknown as Db

    await expect(listStatusEventsByCampaign(db, [CAMPAIGN_A])).rejects.toEqual({
      code: "42501",
      message: "permission denied for table campaign_status_events",
    })

    const fallback = await listStatusEventsByCampaign(db, [CAMPAIGN_A]).catch(
      () => new Map<string, CampaignStatusEvent[]>()
    )
    expect(fallback.size).toBe(0)
  })
})

describe("StatusHistory component (DOS/Give#282)", () => {
  it("returns null when events is empty", () => {
    const html = renderToStaticMarkup(createElement(StatusHistory, { events: [], campaignTitle: "Xây cầu Bản Mây" }))
    expect(html).toBe("")
  })

  it("renders a closed <details> disclosure with count, sr-only campaign title, STATUS_LABELS transitions, Vietnam timestamps, and multiline max-w-[68ch] reasons", () => {
    const events: readonly CampaignStatusEvent[] = [
      {
        id: 21,
        campaign_id: CAMPAIGN_A,
        from_status: "live",
        to_status: "suspended",
        reason: "Tạm dừng để xác minh chứng từ bệnh viện.\nĐề nghị người tổ chức phản hồi trong 48 giờ.",
        created_at: "2026-11-18T08:45:00.000Z",
      },
      {
        id: 15,
        campaign_id: CAMPAIGN_A,
        from_status: "in_review",
        to_status: "approved",
        reason: "   \n  ",
        created_at: "2026-11-17T03:00:00.000Z",
      },
      {
        id: 8,
        campaign_id: CAMPAIGN_A,
        from_status: null,
        to_status: "draft",
        reason: null,
        created_at: "2026-11-15T01:30:00.000Z",
      },
      {
        id: 3,
        campaign_id: CAMPAIGN_A,
        from_status: "future_state" as CampaignStatus,
        to_status: "in_review",
        reason: null,
        created_at: "2026-11-14T00:00:00.000Z",
      },
    ]

    const html = renderToStaticMarkup(
      createElement(StatusHistory, { events, campaignTitle: "Áo ấm vùng cao 2026" })
    ).replace(/\u00a0/g, " ")
    const doc = parseDoc(html)

    const details = doc.querySelector("details")!
    expect(details).toBeTruthy()
    expect(details.hasAttribute("open")).toBe(false)

    const summary = details.querySelector("summary")!
    expect(summary.textContent).toContain("Lịch sử trạng thái (4): Áo ấm vùng cao 2026")
    expect(summary.querySelector(".sr-only")?.textContent).toBe(": Áo ấm vùng cao 2026")
    expect(summary.className).toContain("min-h-11")

    const items = [...details.querySelectorAll("ol > li")]
    expect(items).toHaveLength(4)

    // 1) Multiline reason rendered with whitespace-pre-line and max-w-[68ch]
    expect(items[0]!.textContent).toContain(`${STATUS_LABELS.live} → ${STATUS_LABELS.suspended}`)
    expect(items[0]!.querySelector("time")?.getAttribute("datetime")).toBe("2026-11-18T08:45:00.000Z")
    expect(items[0]!.querySelector("time")?.textContent).toBe(formatDateTime("2026-11-18T08:45:00.000Z"))
    const reasonP = items[0]!.querySelector("p")!
    expect(reasonP).toBeTruthy()
    expect(reasonP.className).toContain("whitespace-pre-line")
    expect(reasonP.className).toContain("max-w-[68ch]")
    expect(reasonP.textContent).toBe(
      "Tạm dừng để xác minh chứng từ bệnh viện.\nĐề nghị người tổ chức phản hồi trong 48 giờ."
    )

    // 2) Whitespace-only reason renders no <p>
    expect(items[1]!.textContent).toContain(`${STATUS_LABELS.in_review} → ${STATUS_LABELS.approved}`)
    expect(items[1]!.querySelector("p")).toBeNull()

    // 3) Null from_status renders target status cleanly without a dangling arrow
    expect(items[2]!.textContent).toContain(STATUS_LABELS.draft)
    expect(items[2]!.textContent).not.toContain("→")
    expect(items[2]!.querySelector("p")).toBeNull()

    // 4) Unknown runtime status falls back to raw status string instead of "undefined"
    expect(items[3]!.textContent).toContain(`future_state → ${STATUS_LABELS.in_review}`)
  })
})
