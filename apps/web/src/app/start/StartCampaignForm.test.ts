// @vitest-environment happy-dom
/** StartCampaignForm template selection, keyboard navigation, and field preservation (DOS/Give#338). */
import { act, createElement } from "react"
import { createRoot, hydrateRoot, type Root } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { CAMPAIGN_TEMPLATES, getCampaignTemplate } from "@/lib/campaign-templates"
import { newCampaignSchema } from "@/lib/validation"

import { StartCampaignForm } from "./StartCampaignForm"

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined
}

let container: HTMLDivElement
let root: Root

function renderForm() {
  act(() => {
    root.render(createElement(StartCampaignForm, { action: async () => null }))
  })
}

function templateRadio(id: string) {
  const el = container.querySelector<HTMLButtonElement>(`button[role="radio"][data-template-id="${id}"]`)
  expect(el, `missing template radio ${id}`).toBeTruthy()
  return el!
}

function typeRadio(value: "give" | "back") {
  const el = container.querySelector<HTMLInputElement>(`input[type="radio"][name="type"][value="${value}"]`)
  expect(el, `missing type radio ${value}`).toBeTruthy()
  return el!
}

function titleInput() {
  return container.querySelector<HTMLInputElement>("#title")!
}

function goalInput() {
  return container.querySelector<HTMLInputElement>("#goal_amount")!
}

function templateHiddenInput() {
  return container.querySelector<HTMLInputElement>('input[type="hidden"][name="template_id"]')!
}

function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
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

describe("StartCampaignForm (DOS/Give#338)", () => {
  it("defaults to the blank template with give checked, empty goal, and hidden template_id=blank", () => {
    renderForm()

    const radiogroup = container.querySelector('[role="radiogroup"]')
    expect(radiogroup).toBeTruthy()
    expect(radiogroup?.getAttribute("aria-labelledby")).toBe("template_picker_label")
    expect(radiogroup?.getAttribute("aria-describedby")).toBe("template_hint")

    const buttons = container.querySelectorAll('button[role="radio"]')
    expect(buttons).toHaveLength(CAMPAIGN_TEMPLATES.length)
    expect(templateRadio("blank").getAttribute("aria-checked")).toBe("true")
    expect(templateRadio("blank").tabIndex).toBe(0)
    expect(templateRadio("medical_emergency").getAttribute("aria-checked")).toBe("false")
    expect(templateRadio("medical_emergency").tabIndex).toBe(-1)

    expect(templateHiddenInput().value).toBe("blank")
    expect(typeRadio("give").checked).toBe(true)
    expect(typeRadio("back").checked).toBe(false)
    expect(goalInput().value).toBe("")
    expect(goalInput().placeholder).toBe("50.000.000")
    expect(titleInput().getAttribute("placeholder")).toBeNull()
    expect(container.querySelector("#title_hint")).toBeNull()
    expect(container.querySelector("#goal_amount_hint")).toBeNull()
  })

  it("pre-fills type, parseable goal_amount, title placeholder/hint, and template_id when selecting templates while preserving user title", () => {
    renderForm()

    setInputValue(titleInput(), "Dự án thư viện cho em")

    act(() => templateRadio("creative_product").click())
    expect(templateHiddenInput().value).toBe("creative_product")
    expect(templateRadio("creative_product").getAttribute("aria-checked")).toBe("true")
    expect(templateRadio("blank").getAttribute("aria-checked")).toBe("false")
    expect(typeRadio("back").checked).toBe(true)
    expect(typeRadio("give").checked).toBe(false)
    expect(goalInput().value).toBe("80.000.000")
    expect(titleInput().value).toBe("Dự án thư viện cho em")
    expect(titleInput().placeholder).toBe(getCampaignTemplate("creative_product")!.titlePlaceholder)
    expect(titleInput().getAttribute("aria-describedby")).toBe("title_hint")
    expect(container.querySelector("#title_hint")?.textContent).toContain("Sản phẩm & Dự án sáng tạo")
    expect(goalInput().getAttribute("aria-describedby")).toBe("goal_amount_hint")

    const parsed = newCampaignSchema.safeParse({
      type: typeRadio("back").checked ? "back" : "give",
      title: titleInput().value,
      goal_amount: goalInput().value,
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data).toEqual({
        type: "back",
        title: "Dự án thư viện cho em",
        goal_amount: 80_000_000,
      })
    }

    act(() => templateRadio("medical_emergency").click())
    expect(templateHiddenInput().value).toBe("medical_emergency")
    expect(typeRadio("give").checked).toBe(true)
    expect(goalInput().value).toBe("100.000.000")
    expect(titleInput().value).toBe("Dự án thư viện cho em")
    expect(titleInput().placeholder).toBe(getCampaignTemplate("medical_emergency")!.titlePlaceholder)

    // Returning to blank clears the untouched template goal while keeping the user's title.
    act(() => templateRadio("blank").click())
    expect(templateHiddenInput().value).toBe("blank")
    expect(typeRadio("give").checked).toBe(true)
    expect(goalInput().value).toBe("")
    expect(titleInput().value).toBe("Dự án thư viện cho em")
    expect(titleInput().getAttribute("placeholder")).toBeNull()
    expect(container.querySelector("#title_hint")).toBeNull()
  })

  it("preserves a custom goal amount when returning to blank and lets user override campaign type manually", () => {
    renderForm()

    act(() => templateRadio("medical_emergency").click())
    expect(goalInput().value).toBe("100.000.000")

    setInputValue(goalInput(), "125.000.000")
    act(() => templateRadio("blank").click())
    expect(goalInput().value).toBe("125.000.000")

    act(() => templateRadio("education_community").click())
    expect(typeRadio("give").checked).toBe(true)
    expect(goalInput().value).toBe("50.000.000")

    // User manually switches campaign type after choosing a template.
    act(() => typeRadio("back").click())
    expect(typeRadio("back").checked).toBe(true)
    expect(templateHiddenInput().value).toBe("education_community")

    // Re-clicking the already-selected template does not clobber manual type or goal overrides.
    setInputValue(goalInput(), "75.000.000")
    act(() => templateRadio("education_community").click())
    expect(typeRadio("back").checked).toBe(true)
    expect(goalInput().value).toBe("75.000.000")
  })

  it("preserves pre-hydration edits to type, title, and goal_amount across React hydration", () => {
    act(() => root.unmount())
    const ssrContainer = document.createElement("div")
    ssrContainer.innerHTML = renderToString(createElement(StartCampaignForm, { action: async () => null }))
    document.body.append(ssrContainer)

    try {
      const preBack = ssrContainer.querySelector<HTMLInputElement>('input[type="radio"][name="type"][value="back"]')!
      const preTitle = ssrContainer.querySelector<HTMLInputElement>("#title")!
      const preGoal = ssrContainer.querySelector<HTMLInputElement>("#goal_amount")!
      preBack.checked = true
      preTitle.value = "Dự án gõ trước khi hydrate"
      preGoal.value = "90.000.000"

      let hydratedRoot: Root
      act(() => {
        hydratedRoot = hydrateRoot(ssrContainer, createElement(StartCampaignForm, { action: async () => null }))
      })

      expect(
        ssrContainer.querySelector<HTMLInputElement>('input[type="radio"][name="type"][value="back"]')!.checked
      ).toBe(true)
      expect(ssrContainer.querySelector<HTMLInputElement>("#title")!.value).toBe("Dự án gõ trước khi hydrate")
      expect(ssrContainer.querySelector<HTMLInputElement>("#goal_amount")!.value).toBe("90.000.000")

      act(() => hydratedRoot.unmount())
    } finally {
      ssrContainer.remove()
      root = createRoot(container)
    }
  })

  it("supports keyboard arrow, Home, and End navigation with roving tabindex across template cards", () => {
    renderForm()

    const blankBtn = templateRadio("blank")
    act(() => {
      blankBtn.focus()
      blankBtn.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }))
    })
    expect(templateHiddenInput().value).toBe("medical_emergency")
    expect(document.activeElement).toBe(templateRadio("medical_emergency"))
    expect(templateRadio("medical_emergency").tabIndex).toBe(0)
    expect(blankBtn.tabIndex).toBe(-1)

    act(() => {
      templateRadio("medical_emergency").dispatchEvent(new KeyboardEvent("keydown", { key: "End", bubbles: true }))
    })
    expect(templateHiddenInput().value).toBe("creative_product")
    expect(document.activeElement).toBe(templateRadio("creative_product"))
    expect(typeRadio("back").checked).toBe(true)

    act(() => {
      templateRadio("creative_product").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }))
    })
    expect(templateHiddenInput().value).toBe("relief_environment")
    expect(document.activeElement).toBe(templateRadio("relief_environment"))
    expect(typeRadio("give").checked).toBe(true)

    act(() => {
      templateRadio("relief_environment").dispatchEvent(new KeyboardEvent("keydown", { key: "Home", bubbles: true }))
    })
    expect(templateHiddenInput().value).toBe("blank")
    expect(document.activeElement).toBe(templateRadio("blank"))
  })
})
