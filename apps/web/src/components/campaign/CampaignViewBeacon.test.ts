// @vitest-environment happy-dom
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resetViewedMemoryCache, trackCampaignView } from "@/lib/analytics-client"
import { CampaignViewBeacon } from "./CampaignViewBeacon"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const CAMPAIGN = "22222222-2222-4222-8222-222222222222"

let container: HTMLDivElement
let root: Root
let sendBeaconDescriptor: PropertyDescriptor | undefined

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  resetViewedMemoryCache()
  window.localStorage.clear()
  window.location.href = "https://beta.give.vn/campaigns/xay-cau"
  sendBeaconDescriptor = Object.getOwnPropertyDescriptor(navigator, "sendBeacon")
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  if (sendBeaconDescriptor) {
    Object.defineProperty(navigator, "sendBeacon", sendBeaconDescriptor)
  } else {
    Reflect.deleteProperty(navigator, "sendBeacon")
  }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("CampaignViewBeacon and trackCampaignView (DOS/Give#252)", () => {
  it("fires at most once per campaign per Vietnam day per browser and strips referrer path/query", async () => {
    const sentBodies: string[] = []
    const sendBeacon = vi.fn((_url: string, data?: BodyInit | null) => {
      if (data instanceof Blob) {
        void data.text().then((text) => sentBodies.push(text))
      }
      return true
    })
    Object.defineProperty(navigator, "sendBeacon", { value: sendBeacon, configurable: true, writable: true })
    Object.defineProperty(document, "referrer", {
      value: "https://l.facebook.com/l.php?u=https%3A%2F%2Fbeta.give.vn&fbclid=secret",
      configurable: true,
    })

    await act(async () => {
      root.render(createElement(CampaignViewBeacon, { campaignId: CAMPAIGN }))
    })
    await Promise.resolve()

    expect(sendBeacon).toHaveBeenCalledTimes(1)
    expect(sendBeacon.mock.calls[0][0]).toBe("/api/analytics/event")
    expect(JSON.parse(sentBodies[0])).toEqual({
      campaignId: CAMPAIGN,
      event: "view",
      referrer: "l.facebook.com",
    })

    // Simulating a page reload on the same Vietnam day (empty memory cache, existing localStorage) does not re-fire.
    resetViewedMemoryCache()
    act(() => root.unmount())
    root = createRoot(container)
    await act(async () => {
      root.render(createElement(CampaignViewBeacon, { campaignId: CAMPAIGN }))
    })
    expect(sendBeacon).toHaveBeenCalledTimes(1)
  })

  it("records a new view on the next Vietnam day and prunes stale days from localStorage", () => {
    const sendBeacon = vi.fn(() => true)
    Object.defineProperty(navigator, "sendBeacon", { value: sendBeacon, configurable: true, writable: true })
    Object.defineProperty(document, "referrer", { value: "https://beta.give.vn/campaigns", configurable: true })

    // Day 1 in Vietnam time
    expect(trackCampaignView(CAMPAIGN, new Date("2026-11-21T10:00:00.000Z"))).toBe(true)
    expect(trackCampaignView(CAMPAIGN, new Date("2026-11-21T16:50:00.000Z"))).toBe(false)
    expect(sendBeacon).toHaveBeenCalledTimes(1)

    // Day 2 in Vietnam time (17:05 UTC = 00:05 UTC+7 next day)
    expect(trackCampaignView(CAMPAIGN, new Date("2026-11-21T17:05:00.000Z"))).toBe(true)
    expect(sendBeacon).toHaveBeenCalledTimes(2)
    expect(JSON.parse(window.localStorage.getItem("give:campaign_views") ?? "{}")).toEqual({
      [CAMPAIGN]: "2026-11-22",
    })
  })

  it("falls back to keepalive fetch with credentials omit when sendBeacon is unavailable or returns false", () => {
    Object.defineProperty(navigator, "sendBeacon", { value: vi.fn(() => false), configurable: true, writable: true })
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal("fetch", fetchMock)
    Object.defineProperty(document, "referrer", { value: "", configurable: true })

    expect(trackCampaignView(CAMPAIGN)).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/analytics/event",
      expect.objectContaining({
        method: "POST",
        keepalive: true,
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
      })
    )
  })

  it("never throws when localStorage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError")
    })
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError")
    })
    const sendBeacon = vi.fn(() => true)
    Object.defineProperty(navigator, "sendBeacon", { value: sendBeacon, configurable: true, writable: true })

    expect(() => trackCampaignView(CAMPAIGN)).not.toThrow()
    expect(sendBeacon).toHaveBeenCalledTimes(1)
    // In-memory dedup still prevents double count in the same session.
    expect(trackCampaignView(CAMPAIGN)).toBe(false)
    expect(sendBeacon).toHaveBeenCalledTimes(1)
  })
})
