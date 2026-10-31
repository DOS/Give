import { z } from "zod"

import { parseVnd, toVietnamLocalInput } from "./format"

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))

const money = z.string().transform((value, ctx) => {
  const parsed = parseVnd(value)
  if (parsed === null) {
    ctx.addIssue({ code: "custom", message: "Số tiền không hợp lệ" })
    return z.NEVER
  }
  return parsed
})

const optionalMoney = z.string().transform((value, ctx) => {
  if (value.trim() === "") return null
  const parsed = parseVnd(value)
  if (parsed === null) {
    ctx.addIssue({ code: "custom", message: "Số tiền không hợp lệ" })
    return z.NEVER
  }
  return parsed
})

/** A datetime-local value ("2026-11-01T09:00"), read as Vietnam time. */
const optionalLocalDate = z.string().transform((value, ctx) => {
  if (value.trim() === "") return null
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    ctx.addIssue({ code: "custom", message: "Ngày giờ không hợp lệ" })
    return z.NEVER
  }
  const date = new Date(`${value}:00+07:00`)
  // Rejects impossible dates ("2026-13-01") and ones that roll over ("02-31").
  if (Number.isNaN(date.getTime()) || toVietnamLocalInput(date.toISOString()) !== value) {
    ctx.addIssue({ code: "custom", message: "Ngày giờ không hợp lệ" })
    return z.NEVER
  }
  return date.toISOString()
})

export const organizerSchema = z.object({
  kind: z.enum(["individual", "organization"]),
  legal_name: z.string().trim().min(2, "Nhập họ tên hoặc tên tổ chức").max(120),
  display_name: z.string().trim().min(2, "Nhập tên hiển thị").max(80),
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s.-]/g, ""))
    .refine((v) => v === "" || /^\+?[0-9]{8,15}$/.test(v), "Số điện thoại không hợp lệ")
    .transform((v) => (v === "" ? null : v)),
})

/** The default min_contribution (10.000 đ) caps how small a goal can be. */
export const MIN_GOAL = 10_000

export const newCampaignSchema = z.object({
  type: z.enum(["give", "back"], { message: "Chọn loại chiến dịch" }),
  title: z.string().trim().min(5, "Tiêu đề cần ít nhất 5 ký tự").max(120),
  goal_amount: money.refine((v) => v >= MIN_GOAL, "Mục tiêu tối thiểu là 10.000 ₫"),
})

const paymentWindowDays = z.string().transform((value, ctx) => {
  if (value.trim() === "") return 7
  const days = Number(value)
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    ctx.addIssue({ code: "custom", message: "Số ngày thanh toán phải từ 1 đến 30" })
    return z.NEVER
  }
  return days
})

export const campaignContentSchema = z
  .object({
    title: z.string().trim().min(5, "Tiêu đề cần ít nhất 5 ký tự").max(120),
    summary: optionalText(200),
    story: optionalText(50000),
    category_id: z
      .string()
      .transform((v) => (v === "" ? null : v))
      .pipe(z.uuid().nullable()),
    beneficiary_name: optionalText(120),
    beneficiary_relation: optionalText(120),
    goal_amount: money.refine((v) => v >= MIN_GOAL, "Mục tiêu tối thiểu là 10.000 ₫"),
    min_contribution: money,
    stretch_goal_amount: optionalMoney,
    starts_at: optionalLocalDate,
    ends_at: optionalLocalDate,
    payment_window_days: paymentWindowDays,
  })
  .refine((v) => v.min_contribution <= v.goal_amount, {
    message: "Mức góp tối thiểu không được lớn hơn mục tiêu",
    path: ["min_contribution"],
  })
  .refine((v) => v.stretch_goal_amount === null || v.stretch_goal_amount > v.goal_amount, {
    message: "Mục tiêu mở rộng phải lớn hơn mục tiêu chính",
    path: ["stretch_goal_amount"],
  })
  .refine((v) => !v.starts_at || !v.ends_at || v.ends_at > v.starts_at, {
    message: "Ngày kết thúc phải sau ngày bắt đầu",
    path: ["ends_at"],
  })

export const milestoneSchema = z.object({
  title: z.string().trim().min(2, "Tên mốc cần ít nhất 2 ký tự").max(120),
  target_amount: money,
  description: optionalText(2000),
})

export const updateSchema = z.object({
  title: z.string().trim().min(2, "Nhập tiêu đề").max(200),
  body: z.string().trim().min(1, "Nhập nội dung").max(50000),
})

/** Pulls a form's string fields into a plain object for zod. */
export function formFields(form: FormData, keys: readonly string[]): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, String(form.get(k) ?? "")]))
}

export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Dữ liệu không hợp lệ"
}
