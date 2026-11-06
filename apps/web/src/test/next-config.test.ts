import { describe, expect, it } from "vitest"

import nextConfig from "../../next.config"

/** A glob as Next's localPatterns use it ("**" spans segments, "*" one segment). */
function globToRegExp(glob: string): RegExp {
  const source = glob
    .split("**")
    .map((part) =>
      part
        .split("*")
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join("[^/]*")
    )
    .join(".*")
  return new RegExp(`^${source}$`)
}

const patterns = (nextConfig.images?.localPatterns ?? []).map((p) => globToRegExp(p.pathname ?? "**"))
const optimizable = (path: string) => patterns.some((re) => re.test(path))

describe("image optimizer allow-list", () => {
  it("optimizes public covers only, never evidence (its cache would outlive a staff hide, DOS/Give#58)", () => {
    const uuid = "22222222-2222-4222-8222-222222222222"
    expect(optimizable(`/media/public/campaigns/${uuid}/${uuid}.webp`)).toBe(true)
    expect(optimizable(`/media/public/evidence/${uuid}/${uuid}/${uuid}.webp`)).toBe(false)
    expect(optimizable(`/media/evidence/${uuid}/${uuid}/${uuid}.webp`)).toBe(false)
    expect(optimizable(`/media/private/campaigns/${uuid}/${uuid}.webp`)).toBe(false)
  })
})
