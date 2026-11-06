import { describe, expect, it } from "vitest"

import { SLUG_PATTERN, slugify, uniqueSlug } from "./slug"

describe("slugify", () => {
  it("strips Vietnamese diacritics, including đ", () => {
    expect(slugify("Xây trường cho trẻ em vùng cao")).toBe("xay-truong-cho-tre-em-vung-cao")
    expect(slugify("Đường đến trường")).toBe("duong-den-truong")
    expect(slugify("Hỗ trợ đồng bào lũ lụt miền Trung!")).toBe("ho-tro-dong-bao-lu-lut-mien-trung")
  })

  it("trims to the limit without a trailing dash", () => {
    const slug = slugify("a".repeat(30) + " " + "b".repeat(40), 31)
    expect(slug).toBe("a".repeat(30))
  })

  it("falls back when nothing usable is left", () => {
    expect(slugify("!!!")).toBe("chien-dich")
  })
})

describe("uniqueSlug", () => {
  it("adds a 5-character suffix and matches the database check", () => {
    const slug = uniqueSlug("Quỹ học bổng 2026", () => 0.5)
    expect(slug).toMatch(/^quy-hoc-bong-2026-[a-z0-9]{5}$/)
    expect(SLUG_PATTERN.test(slug)).toBe(true)
    expect(uniqueSlug("x".repeat(200), () => 0.999999).length).toBeLessThanOrEqual(80)
  })
})
