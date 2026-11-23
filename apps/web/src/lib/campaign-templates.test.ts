import { describe, expect, it } from "vitest"

import { FAQ_ANSWER_MAX, FAQ_QUESTION_MAX } from "./campaign-faqs"
import { CAMPAIGN_TEMPLATES, formatTemplateGoal, getCampaignTemplate } from "./campaign-templates"
import { parseVnd } from "./format"
import { campaignFaqSchema, MIN_GOAL } from "./validation"

describe("campaign-templates (DOS/Give#338)", () => {
  it("exposes the 5 curated Vietnamese templates with expected defaults", () => {
    expect(CAMPAIGN_TEMPLATES.map((t) => t.id)).toEqual([
      "blank",
      "medical_emergency",
      "education_community",
      "relief_environment",
      "creative_product",
    ])

    const blank = getCampaignTemplate("blank")
    expect(blank).toMatchObject({
      id: "blank",
      type: "give",
      categorySlug: null,
      suggestedGoal: null,
      summary: "",
      story: "",
      starterFaqs: [],
    })

    expect(getCampaignTemplate("medical_emergency")).toMatchObject({
      type: "give",
      categorySlug: "healthcare",
      suggestedGoal: 100_000_000,
    })
    expect(getCampaignTemplate("education_community")).toMatchObject({
      type: "give",
      categorySlug: "education-charity",
      suggestedGoal: 50_000_000,
    })
    expect(getCampaignTemplate("relief_environment")).toMatchObject({
      type: "give",
      categorySlug: "disaster-relief",
      suggestedGoal: 150_000_000,
    })
    expect(getCampaignTemplate("creative_product")).toMatchObject({
      type: "back",
      categorySlug: "technology",
      suggestedGoal: 80_000_000,
    })
  })

  it("allows only known template ids and rejects unknown, non-string, or prototype keys", () => {
    for (const template of CAMPAIGN_TEMPLATES) {
      expect(getCampaignTemplate(template.id)).toBe(template)
    }
    for (const invalid of [
      null,
      undefined,
      "",
      "unknown",
      "medical",
      123,
      {},
      "__proto__",
      "constructor",
      "toString",
    ]) {
      expect(getCampaignTemplate(invalid)).toBeNull()
    }
  })

  it("keeps every non-blank template within DB summary/story/FAQ schema limits and parseable VND goal", () => {
    const nonBlank = CAMPAIGN_TEMPLATES.filter((t) => t.id !== "blank")
    expect(nonBlank).toHaveLength(4)

    for (const template of nonBlank) {
      expect(template.name.trim().length).toBeGreaterThan(0)
      expect(template.tagline.trim().length).toBeGreaterThan(0)
      expect(template.titlePlaceholder.trim().length).toBeGreaterThan(0)
      expect(template.categorySlug).toBeTruthy()
      expect(template.suggestedGoal).not.toBeNull()
      expect(template.suggestedGoal!).toBeGreaterThanOrEqual(MIN_GOAL)
      expect(parseVnd(formatTemplateGoal(template.suggestedGoal!))).toBe(template.suggestedGoal)

      expect(template.summary.length).toBeGreaterThan(20)
      expect(template.summary.length).toBeLessThanOrEqual(200)
      expect(template.story.length).toBeGreaterThanOrEqual(100)
      expect(template.story.length).toBeLessThanOrEqual(50_000)
      expect(template.story).toContain("## ")

      expect(template.starterFaqs).toHaveLength(3)
      for (const faq of template.starterFaqs) {
        expect(faq.question.length).toBeLessThanOrEqual(FAQ_QUESTION_MAX)
        expect(faq.answer.length).toBeLessThanOrEqual(FAQ_ANSWER_MAX)
        expect(campaignFaqSchema.safeParse(faq).success).toBe(true)
      }
    }
  })
})
