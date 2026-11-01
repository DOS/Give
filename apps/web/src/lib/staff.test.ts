import { describe, expect, it } from "vitest"

import { fakeDb } from "@/test/fake-db"

import { describeChange, isStaffRole, listStaff, roleLabel } from "./staff"

describe("isStaffRole", () => {
  it("accepts only the three staff roles", () => {
    expect(["moderator", "finance", "admin"].every(isStaffRole)).toBe(true)
    expect(isStaffRole("owner")).toBe(false)
    expect(isStaffRole(undefined)).toBe(false)
  })
})

describe("roleLabel", () => {
  it("labels known roles in Vietnamese and passes unknown ones through", () => {
    expect(roleLabel("admin")).toBe("Quản trị viên")
    expect(roleLabel("owner")).toBe("owner")
    expect(roleLabel(null)).toBe("—")
  })
})

describe("describeChange", () => {
  it("describes grants, changes and revokes", () => {
    expect(describeChange({ action: "admin.grant", before_role: null, after_role: "moderator" })).toBe(
      "Cấp quyền Kiểm duyệt viên"
    )
    expect(describeChange({ action: "admin.change", before_role: "moderator", after_role: "finance" })).toBe(
      "Đổi quyền Kiểm duyệt viên → Tài chính"
    )
    expect(describeChange({ action: "admin.revoke", before_role: "admin", after_role: null })).toBe(
      "Thu quyền Quản trị viên"
    )
  })
})

describe("listStaff", () => {
  it("throws when the database refuses, so the page does not show an empty list", async () => {
    const db = fakeDb(() => ({ error: { code: "42501", message: "GIVE_ADMIN_REQUIRED" } }))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(listStaff(db as any)).rejects.toThrow("GIVE_ADMIN_REQUIRED")
  })
})
