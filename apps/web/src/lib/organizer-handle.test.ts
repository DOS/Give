import { describe, expect, it } from "vitest"

import {
  isNavigableOrganizerHandle,
  isReservedOrganizerHandle,
  isValidOrganizerHandleFormat,
  normalizeOrganizerHandle,
  ORGANIZER_HANDLE_INVALID_MESSAGE,
  ORGANIZER_HANDLE_MAX,
  ORGANIZER_HANDLE_MIN,
  ORGANIZER_HANDLE_RESERVED_MESSAGE,
  organizerInitial,
  organizerProfileHref,
  RESERVED_ORGANIZER_HANDLES,
  safeAvatarUrl,
  validateOrganizerHandle,
} from "./organizer-handle"

describe("organizer-handle validation (DOS/Give#251, #261)", () => {
  it("normalizes trimming and casing", () => {
    expect(normalizeOrganizerHandle("  Quy-Anh-Sang  ")).toBe("quy-anh-sang")
    expect(normalizeOrganizerHandle("")).toBe("")
  })

  it("validates format and 3..40 length bounds matching give.organizers_validate_handle", () => {
    expect(isValidOrganizerHandleFormat("a".repeat(ORGANIZER_HANDLE_MIN))).toBe(true)
    expect(isValidOrganizerHandleFormat("a".repeat(ORGANIZER_HANDLE_MAX))).toBe(true)
    expect(isValidOrganizerHandleFormat("quy-hoc-bong-2026")).toBe(true)
    expect(isValidOrganizerHandleFormat("a1")).toBe(false)
    expect(isValidOrganizerHandleFormat("a".repeat(ORGANIZER_HANDLE_MAX + 1))).toBe(false)
    expect(isValidOrganizerHandleFormat("-leading")).toBe(false)
    expect(isValidOrganizerHandleFormat("trailing-")).toBe(false)
    expect(isValidOrganizerHandleFormat("double--hyphen")).toBe(false)
    expect(isValidOrganizerHandleFormat("has_underscore")).toBe(false)
    expect(isValidOrganizerHandleFormat("has space")).toBe(false)
    expect(isValidOrganizerHandleFormat("có-dấu")).toBe(false)
    expect(isValidOrganizerHandleFormat("UpperCase")).toBe(false)
  })

  it("rejects reserved route and system words matching give.is_reserved_organizer_handle", () => {
    expect(RESERVED_ORGANIZER_HANDLES.size).toBe(96)
    for (const word of [
      "admin",
      "api",
      "auth",
      "campaigns",
      "email",
      "me",
      "media",
      "plans",
      "start",
      "u",
      "user",
      "users",
      "organizer",
      "organizers",
      "profile",
      "profiles",
      "give",
      "give-vn",
      "back",
      "support",
      "about",
      "terms",
      "privacy",
      "www",
    ]) {
      expect(isReservedOrganizerHandle(word), word).toBe(true)
      expect(isReservedOrganizerHandle(`  ${word.toUpperCase()}  `), word).toBe(true)
      if (word.length >= ORGANIZER_HANDLE_MIN) {
        expect(validateOrganizerHandle(word)).toEqual({
          ok: false,
          reason: "reserved",
          message: ORGANIZER_HANDLE_RESERVED_MESSAGE,
        })
      }
    }
    expect(isReservedOrganizerHandle("quy-ban-may")).toBe(false)
  })

  it("maps blank input to null and returns structured results for valid/invalid/reserved inputs", () => {
    expect(validateOrganizerHandle("")).toEqual({ ok: true, value: null })
    expect(validateOrganizerHandle("   ")).toEqual({ ok: true, value: null })
    expect(validateOrganizerHandle("  Quy-Ban-May  ")).toEqual({ ok: true, value: "quy-ban-may" })
    expect(validateOrganizerHandle("ab")).toEqual({
      ok: false,
      reason: "invalid",
      message: ORGANIZER_HANDLE_INVALID_MESSAGE,
    })
    expect(validateOrganizerHandle("bad--slug")).toEqual({
      ok: false,
      reason: "invalid",
      message: ORGANIZER_HANDLE_INVALID_MESSAGE,
    })
    expect(validateOrganizerHandle("ADMIN")).toEqual({
      ok: false,
      reason: "reserved",
      message: ORGANIZER_HANDLE_RESERVED_MESSAGE,
    })
  })

  it("gates public links via isNavigableOrganizerHandle", () => {
    expect(isNavigableOrganizerHandle("quy-ban-may")).toBe(true)
    expect(isNavigableOrganizerHandle(null)).toBe(false)
    expect(isNavigableOrganizerHandle(undefined)).toBe(false)
    expect(isNavigableOrganizerHandle("")).toBe(false)
    expect(isNavigableOrganizerHandle("admin")).toBe(false)
    expect(isNavigableOrganizerHandle("Quy-Ban-May")).toBe(false)
    expect(isNavigableOrganizerHandle("../evil")).toBe(false)
    expect(organizerProfileHref("quy-ban-may")).toBe("/u/quy-ban-may")
  })

  it("extracts Unicode-safe initials", () => {
    expect(organizerInitial("  Quỹ Bản Mây")).toBe("Q")
    expect(organizerInitial("đồng hành")).toBe("Đ")
    expect(organizerInitial("🌱 Bản Xanh")).toBe("🌱")
    expect(organizerInitial("   ")).toBe("")
  })

  it("sanitizes avatar URLs: allows public https only and blocks unsafe schemes, credentials, and private hosts", () => {
    expect(safeAvatarUrl("https://cdn.dos.me/avatars/u1.jpg")).toBe("https://cdn.dos.me/avatars/u1.jpg")
    expect(safeAvatarUrl("  https://lh3.googleusercontent.com/a/avatar=s96-c  ")).toBe(
      "https://lh3.googleusercontent.com/a/avatar=s96-c"
    )
    for (const unsafe of [
      null,
      undefined,
      "",
      "   ",
      "http://cdn.dos.me/avatar.png",
      "javascript:alert(1)",
      "data:image/svg+xml,<svg onload=alert(1)>",
      "blob:https://give.vn/1234",
      "//cdn.dos.me/avatar.png",
      "/relative/path.png",
      "https://user:pass@cdn.dos.me/avatar.png",
      "https://localhost/avatar.png",
      "https://localhost./avatar.png",
      "https://sub.localhost/avatar.png",
      "https://sub.localhost./avatar.png",
      "https://svc.internal./avatar.png",
      "https://metadata/avatar.png",
      "https://supabase-db:5432/avatar.png",
      "https://127.0.0.1/avatar.png",
      "https://10.0.0.1/avatar.png",
      "https://100.64.0.1/avatar.png",
      "https://169.254.169.254/latest/meta-data",
      "https://192.168.1.1/avatar.png",
      "https://172.16.0.1/avatar.png",
      "https://224.0.0.1/avatar.png",
      "https://8.8.8.8/avatar.png",
      "https://[::1]/avatar.png",
      "https://internal.local/avatar.png",
      "https://cdn.dos.me/a\nb.png",
      `https://cdn.dos.me/${"a".repeat(2050)}.png`,
    ]) {
      expect(safeAvatarUrl(unsafe), String(unsafe)).toBeNull()
    }
  })
})
