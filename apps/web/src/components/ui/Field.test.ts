import { Window } from "happy-dom"
import { createElement, Fragment } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { Field } from "./Field"

describe("Field hint association (DOS/Give#228)", () => {
  it("exposes the hint id while preserving caller-provided descriptions", () => {
    const doc = new Window().document
    doc.body.innerHTML = renderToStaticMarkup(
      createElement(
        Fragment,
        null,
        createElement("p", { id: "existing-description" }, "Existing guidance."),
        Field({
          htmlFor: "details",
          label: "Details",
          hint: "Additional guidance.",
          hintId: "details-hint",
          children: createElement("textarea", {
            id: "details",
            "aria-describedby": "existing-description details-hint",
          }),
        })
      )
    )

    expect(doc.querySelector("label")?.getAttribute("for")).toBe("details")
    const description = doc.querySelector("textarea")?.getAttribute("aria-describedby")
    expect(description).toBe("existing-description details-hint")
    const descriptions = description!.split(/\s+/).map((id) => {
      const matches = doc.querySelectorAll(`[id="${id}"]`)
      expect(matches).toHaveLength(1)
      return matches[0].textContent
    })
    expect(descriptions).toEqual(["Existing guidance.", "Additional guidance."])
    expect(doc.getElementById("details-hint")?.className).toBe("hint")
  })
})
