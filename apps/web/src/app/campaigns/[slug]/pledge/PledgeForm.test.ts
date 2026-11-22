// @vitest-environment happy-dom
/** PledgeForm tier selection, money input and shipping fields (DOS/Give#216). */
import { act, createElement, type ComponentProps } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { formatVnd } from "@/lib/format"
import { NO_REWARD, type PublicRewardTier } from "@/lib/pledges"

import { PledgeForm, type PledgeDefaults } from "./PledgeForm"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

const LOW = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const HIGH = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const SOLD_OUT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const SHIPPING = { recipient: "Nguyễn Lan", phone: "0901234567", address: "12 Lý Thường Kiệt, Hà Nội" }
const plain = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 })

function tierRow(id: string, overrides: Partial<PublicRewardTier> = {}): PublicRewardTier {
  return {
    id,
    campaign_id: "campaign",
    title: id === LOW ? "Thiệp cảm ơn" : "Đèn bàn",
    description: null,
    min_amount: 100_000,
    quantity_limit: null,
    quantity_claimed: 0,
    quantity_remaining: null,
    estimated_delivery: null,
    requires_shipping: false,
    shipping_note: null,
    sort_order: 0,
    is_early_bird: false,
    available_until: null,
    ...overrides,
  }
}

let container: HTMLDivElement
let root: Root

function renderForm({
  defaults = {},
  ...props
}: Omit<Partial<ComponentProps<typeof PledgeForm>>, "defaults"> & { defaults?: Partial<PledgeDefaults> } = {}) {
  act(() => {
    root.render(
      createElement(PledgeForm, {
        action: async () => null,
        changing: false,
        tiers: [tierRow(LOW), tierRow(HIGH, { min_amount: 300_000, requires_shipping: true })],
        minContribution: 20_000,
        ...props,
        defaults: {
          tier: LOW,
          amount: null,
          public_name: "Lan",
          anonymous: false,
          message: "",
          shipping: null,
          ...defaults,
        },
      })
    )
  })
}

function radio(id: string) {
  const input = container.querySelector<HTMLInputElement>(`input[name="tier"][value="${id}"]`)
  expect(input, `missing tier ${id}`).toBeTruthy()
  return input!
}

function choose(id: string) {
  act(() => radio(id).click())
  expect(radio(id).checked).toBe(true)
}

function amountInput() {
  return container.querySelector<HTMLInputElement>("#pledge-amount")!
}

function typeAmount(value: string) {
  // Use the native setter so React observes a user edit rather than updating its value tracker.
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(amountInput(), value)
    amountInput().dispatchEvent(new Event("input", { bubbles: true }))
  })
  expect(amountInput().value).toBe(value)
}

function expectAmount(amount: number) {
  expect(amountInput().value).toBe(plain.format(amount))
}

function expectHint(minimum: number) {
  expect(amountInput().getAttribute("aria-describedby")).toBe("pledge-amount-hint")
  expect(container.querySelector("#pledge-amount-hint")?.textContent).toBe(
    `Tối thiểu ${formatVnd(minimum)} cho lựa chọn này.`
  )
}

function shippingFieldset() {
  return Array.from(container.querySelectorAll("fieldset")).find(
    (f) => f.querySelector("legend")?.textContent === "Địa chỉ nhận quà"
  )
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe("PledgeForm (DOS/Give#216)", () => {
  it("renders every reward radio and NO_REWARD, disabling sold-out tiers with their badge", () => {
    renderForm({
      tiers: [tierRow(LOW), tierRow(HIGH, { quantity_remaining: 2 }), tierRow(SOLD_OUT, { quantity_remaining: 0 })],
    })
    expect(container.querySelectorAll('input[type="radio"][name="tier"]')).toHaveLength(4)
    for (const id of [LOW, HIGH, SOLD_OUT, NO_REWARD]) expect(radio(id).required).toBe(true)
    expect(radio(LOW).checked).toBe(true)
    expect(radio(LOW).disabled).toBe(false)
    expect(radio(HIGH).disabled).toBe(false)
    expect(radio(NO_REWARD).disabled).toBe(false)
    expect(radio(NO_REWARD).closest("label")?.textContent).toContain("Ủng hộ không nhận quà")
    const soldOut = radio(SOLD_OUT)
    expect(soldOut.disabled).toBe(true)
    expect(soldOut.closest("label")?.querySelector("span.bg-danger-soft")?.textContent).toBe("Đã hết suất")
    act(() => soldOut.click())
    expect(soldOut.checked).toBe(false)
    expect(radio(LOW).checked).toBe(true)
  })

  it("keeps the open pledge's sold-out default tier enabled, even after switching away and back", () => {
    renderForm({
      tiers: [tierRow(LOW), tierRow(SOLD_OUT, { quantity_remaining: 0 })],
      changing: true,
      defaults: { tier: SOLD_OUT, amount: 250_000 },
    })
    expect(radio(SOLD_OUT).disabled).toBe(false)
    expect(radio(SOLD_OUT).checked).toBe(true)
    expect(radio(SOLD_OUT).closest("label")?.textContent).not.toContain("Đã hết suất")
    expectAmount(250_000)
    choose(LOW)
    choose(SOLD_OUT)
    expectAmount(250_000)
    expect(container.querySelector('button[type="submit"]')?.textContent).toBe("Lưu thay đổi")
  })

  describe("amount and minimum hint on tier changes", () => {
    it("raises a custom amount below the new tier minimum and updates the associated hint", () => {
      renderForm()
      expectAmount(100_000)
      expectHint(100_000)
      typeAmount("200.000")
      choose(HIGH)
      expectAmount(300_000)
      expectHint(300_000)
      expect(radio(LOW).checked).toBe(false)
    })

    it("resets an amount equal to the previous minimum when switching down, including NO_REWARD", () => {
      renderForm({ defaults: { tier: HIGH } })
      expectAmount(300_000)
      choose(LOW)
      expectAmount(100_000)
      expectHint(100_000)
      choose(NO_REWARD)
      expectAmount(20_000)
      expectHint(20_000)
    })

    it.each(["", "not money", "1,5", "0"])("resets an unparseable amount %j to the selected minimum", (typed) => {
      renderForm()
      typeAmount(typed)
      choose(HIGH)
      expectAmount(300_000)
      expectHint(300_000)
    })

    it("preserves a typed custom amount above both minimums, including its input formatting", () => {
      renderForm()
      typeAmount("500,000")
      choose(HIGH)
      expect(amountInput().value).toBe("500,000")
      expectHint(300_000)
      choose(LOW)
      expect(amountInput().value).toBe("500,000")
      expectHint(100_000)
      choose(NO_REWARD)
      expect(amountInput().value).toBe("500,000")
      expectHint(20_000)
    })

    it("uses the campaign minimum when it exceeds a reward tier's minimum", () => {
      renderForm({ minContribution: 200_000 })
      expectAmount(200_000)
      expectHint(200_000)
      choose(HIGH)
      expectAmount(300_000)
      expectHint(300_000)
      choose(LOW)
      expectAmount(200_000)
      expectHint(200_000)
      choose(NO_REWARD)
      expectAmount(200_000)
      expectHint(200_000)
    })
  })

  describe("shipping address", () => {
    it.each([LOW, NO_REWARD, ""])("omits shipping fields for the initial non-shipping choice %j", (tier) => {
      renderForm({ defaults: { tier, shipping: SHIPPING } })
      expect(shippingFieldset()).toBeUndefined()
      expect(
        container.querySelector(
          '[name="ship_recipient"], [name="ship_phone"], [name="ship_address"], #ship-address-hint'
        )
      ).toBeNull()
    })

    it.each([null, "Giao quà trong giờ hành chính."])(
      "mounts required, labelled shipping fields with optional note %j",
      (shippingNote) => {
        renderForm({
          tiers: [tierRow(LOW), tierRow(HIGH, { requires_shipping: true, shipping_note: shippingNote })],
          defaults: { shipping: SHIPPING },
        })
        expect(shippingFieldset()).toBeUndefined()
        choose(HIGH)
        const fieldset = shippingFieldset()!
        expect(fieldset).toBeTruthy()
        for (const [name, id, label, value] of [
          ["ship_recipient", "ship-recipient", "Người nhận", SHIPPING.recipient],
          ["ship_phone", "ship-phone", "Số điện thoại", SHIPPING.phone],
          ["ship_address", "ship-address", "Địa chỉ", SHIPPING.address],
        ]) {
          const field = fieldset.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`)!
          expect(field.id).toBe(id)
          expect(field.required).toBe(true)
          expect(field.value).toBe(value)
          expect(fieldset.querySelector(`label[for="${id}"]`)?.textContent).toBe(label)
        }
        expect(fieldset.querySelector('[name="ship_address"]')?.getAttribute("aria-describedby")).toBe(
          "ship-address-hint"
        )
        expect(fieldset.querySelector("#ship-address-hint")?.textContent).toContain(
          "Chỉ người tạo dự án thấy địa chỉ này"
        )
        const note = Array.from(fieldset.querySelectorAll("p")).find((p) => p.textContent === shippingNote)
        expect(!!note).toBe(shippingNote !== null)
      }
    )

    it.each([LOW, NO_REWARD])("unmounts shipping fields when switching from a shipping tier to %s", (tier) => {
      renderForm({ defaults: { tier: HIGH } })
      expect(shippingFieldset()).toBeTruthy()
      expect(container.querySelector<HTMLInputElement>('[name="ship_recipient"]')?.value).toBe("")
      choose(tier)
      expect(shippingFieldset()).toBeUndefined()
      expect(
        container.querySelector(
          '[name="ship_recipient"], [name="ship_phone"], [name="ship_address"], #ship-address-hint'
        )
      ).toBeNull()
    })
  })

  describe("Early Bird reward tiers (DOS/Give#317)", () => {
    const EB_OPEN = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
    const EB_EXPIRED = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
    const NOW = "2027-01-10T10:00:00.000Z"

    it("enables active Early Bird tiers with badge/deadline and disables expired Early Bird tiers", () => {
      renderForm({
        nowIso: NOW,
        tiers: [
          tierRow(EB_OPEN, {
            title: "Early Bird Mở",
            is_early_bird: true,
            available_until: "2027-01-12T10:00:00.000Z",
            quantity_remaining: 4,
          }),
          tierRow(EB_EXPIRED, {
            title: "Early Bird Hết Hạn",
            is_early_bird: true,
            available_until: "2027-01-10T09:59:00.000Z",
            quantity_remaining: 4,
          }),
        ],
        defaults: { tier: EB_OPEN },
      })

      expect(radio(EB_OPEN).disabled).toBe(false)
      expect(radio(EB_OPEN).closest("label")?.textContent).toContain("Ưu đãi Early Bird")
      expect(radio(EB_OPEN).closest("label")?.textContent).toContain("Ưu đãi đến")
      expect(radio(EB_OPEN).closest("label")?.textContent).toContain("Còn 4 suất")

      expect(radio(EB_EXPIRED).disabled).toBe(true)
      expect(radio(EB_EXPIRED).closest("label")?.textContent).toContain("Ưu đãi Early Bird")
      expect(radio(EB_EXPIRED).closest("label")?.textContent).toContain("Đã hết hạn ưu đãi")
    })

    it("marks an existing open pledge on an expired Early Bird tier while allowing switch to another tier or NO_REWARD", () => {
      renderForm({
        nowIso: NOW,
        changing: true,
        currentTierId: EB_EXPIRED,
        tiers: [
          tierRow(EB_EXPIRED, {
            title: "Early Bird Hết Hạn",
            is_early_bird: true,
            available_until: "2027-01-10T09:59:00.000Z",
            quantity_remaining: 4,
          }),
          tierRow(LOW),
        ],
        defaults: { tier: "" },
      })

      expect(radio(EB_EXPIRED).disabled).toBe(true)
      expect(radio(EB_EXPIRED).checked).toBe(false)
      expect(radio(EB_EXPIRED).closest("label")?.textContent).toContain("Mức hiện tại của bạn")
      expect(radio(EB_EXPIRED).closest("label")?.textContent).toContain("Đã hết hạn ưu đãi")

      choose(LOW)
      expect(radio(LOW).checked).toBe(true)
      choose(NO_REWARD)
      expect(radio(NO_REWARD).checked).toBe(true)
    })
  })
})
