"use client"

import clsx from "clsx"
import { useState } from "react"

import { ActionForm, SubmitButton } from "@/components/forms"
import { Badge } from "@/components/ui/Badge"
import { buttonClass } from "@/components/ui/Button"
import { Field } from "@/components/ui/Field"
import type { ActionResult } from "@/lib/errors"
import { formatVnd, parseVnd } from "@/lib/format"
import { deliveryMonth, isSoldOut, NO_REWARD, type PublicRewardTier, type ShippingAddress } from "@/lib/pledges"

const plain = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 })

export interface PledgeDefaults {
  tier: string
  amount: number | null
  public_name: string
  anonymous: boolean
  message: string
  shipping: ShippingAddress | null
}

/** A choice card's border and tint: chosen, open, or sold out. */
function choiceClass(chosen: boolean, soldOut = false): string {
  return clsx(
    "flex gap-3 rounded-md border p-4 sm:p-5",
    soldOut
      ? "cursor-not-allowed border-line bg-surface"
      : chosen
        ? "cursor-pointer border-brand-600 bg-brand-50 ring-1 ring-brand-600"
        : "cursor-pointer border-line bg-white hover:border-gray-400"
  )
}

/**
 * Step 2 of section 4.2: choose a reward tier or no reward, the amount (at
 * least the tier's minimum), and the delivery address when the tier ships
 * something. `action` is savePledge bound to the campaign and, when the
 * backer has one, their open pledge (which it then changes). Sold-out tiers show but cannot be chosen; the database checks every
 * rule again.
 */
export function PledgeForm({
  action,
  changing,
  tiers,
  minContribution,
  defaults,
}: {
  action: (state: ActionResult, form: FormData) => Promise<ActionResult>
  /** The backer already has an open pledge, which this form replaces. */
  changing: boolean
  tiers: PublicRewardTier[]
  minContribution: number
  defaults: PledgeDefaults
}) {
  const [tierId, setTierId] = useState(defaults.tier)
  const minimumFor = (id: string) =>
    Math.max(minContribution, tiers.find((t) => t.id === id)?.min_amount ?? minContribution)
  const [amount, setAmount] = useState(plain.format(defaults.amount ?? minimumFor(defaults.tier)))
  const tier = tiers.find((t) => t.id === tierId) ?? null
  const minimum = minimumFor(tierId)

  function choose(id: string) {
    setTierId(id)
    // Raise the amount to the new minimum; keep a larger amount the backer typed.
    const typed = parseVnd(amount)
    if (typed === null || typed < minimumFor(id) || typed === minimumFor(tierId))
      setAmount(plain.format(minimumFor(id)))
  }

  return (
    <ActionForm action={action} className="space-y-8">
      <fieldset className="space-y-3">
        <legend className="mb-3 text-xl font-bold text-ink">Chọn phần quà</legend>
        {tiers.map((t) => {
          const soldOut = isSoldOut(t) && t.id !== defaults.tier
          const month = deliveryMonth(t.estimated_delivery)
          return (
            <label key={t.id} className={choiceClass(tierId === t.id, soldOut)}>
              <input
                type="radio"
                name="tier"
                value={t.id}
                checked={tierId === t.id}
                disabled={soldOut}
                required
                onChange={() => choose(t.id)}
                className="mt-1 size-5 shrink-0 accent-brand-700"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="font-semibold break-words text-ink">{t.title}</span>
                  <span className="font-bold text-ink tabular-nums">Từ {formatVnd(t.min_amount)}</span>
                </span>
                {t.description && (
                  <span className="mt-1 block break-words whitespace-pre-line text-body">{t.description}</span>
                )}
                <span className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                  {month && <span>Dự kiến giao: {month}</span>}
                  {t.requires_shipping && <span>Cần địa chỉ nhận quà</span>}
                  {soldOut ? (
                    <Badge tone="danger">Đã hết suất</Badge>
                  ) : (
                    t.quantity_remaining !== null && <span>Còn {t.quantity_remaining} suất</span>
                  )}
                </span>
              </span>
            </label>
          )
        })}
        <label className={choiceClass(tierId === NO_REWARD)}>
          <input
            type="radio"
            name="tier"
            value={NO_REWARD}
            checked={tierId === NO_REWARD}
            required
            onChange={() => choose(NO_REWARD)}
            className="mt-1 size-5 shrink-0 accent-brand-700"
          />
          <span>
            <span className="font-semibold text-ink">Ủng hộ không nhận quà</span>
            <span className="mt-1 block text-body">
              Đồng hành cùng dự án với số tiền bạn chọn, từ {formatVnd(minContribution)}.
            </span>
          </span>
        </label>
      </fieldset>

      <div>
        <label htmlFor="pledge-amount" className="label">
          Số tiền cam kết (đồng)
        </label>
        <input
          id="pledge-amount"
          name="amount"
          required
          inputMode="numeric"
          autoComplete="off"
          aria-describedby="pledge-amount-hint"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="field font-semibold tabular-nums"
        />
        <p id="pledge-amount-hint" className="hint">
          Tối thiểu {formatVnd(minimum)} cho lựa chọn này.
        </p>
      </div>

      {tier?.requires_shipping && (
        <fieldset className="space-y-4 rounded-md border border-line p-4 sm:p-5">
          <legend className="px-1 text-lg font-bold text-ink">Địa chỉ nhận quà</legend>
          {tier.shipping_note && <p className="whitespace-pre-line text-body">{tier.shipping_note}</p>}
          <Field htmlFor="ship-recipient" label="Người nhận">
            <input
              id="ship-recipient"
              name="ship_recipient"
              required
              maxLength={80}
              autoComplete="shipping name"
              defaultValue={defaults.shipping?.recipient ?? ""}
              className="field"
            />
          </Field>
          <Field htmlFor="ship-phone" label="Số điện thoại">
            <input
              id="ship-phone"
              name="ship_phone"
              required
              inputMode="tel"
              maxLength={20}
              autoComplete="shipping tel"
              defaultValue={defaults.shipping?.phone ?? ""}
              className="field"
            />
          </Field>
          <div>
            <label htmlFor="ship-address" className="label">
              Địa chỉ
            </label>
            <textarea
              id="ship-address"
              name="ship_address"
              required
              rows={2}
              maxLength={300}
              autoComplete="shipping street-address"
              aria-describedby="ship-address-hint"
              defaultValue={defaults.shipping?.address ?? ""}
              className="field"
            />
            <p id="ship-address-hint" className="hint">
              Chỉ người tạo dự án thấy địa chỉ này, để gửi quà. Give không tính phí vận chuyển; nếu có, người tạo dự án
              ghi rõ ở phần quà.
            </p>
          </div>
        </fieldset>
      )}

      <fieldset className="space-y-4">
        <legend className="mb-3 text-lg font-bold text-ink">Thông tin hiển thị</legend>
        <Field htmlFor="pledge-name" label="Tên hiển thị">
          <input
            id="pledge-name"
            name="public_name"
            maxLength={80}
            defaultValue={defaults.public_name}
            autoComplete="name"
            className="field"
          />
        </Field>
        <div>
          <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
            <input
              type="checkbox"
              name="anonymous"
              defaultChecked={defaults.anonymous}
              aria-describedby="pledge-anonymous-hint"
              className="mt-1 size-5 shrink-0 accent-brand-700"
            />
            <span className="font-medium text-ink">Ủng hộ ẩn danh</span>
          </label>
          <p id="pledge-anonymous-hint" className="hint">
            Give sẽ không hiện tên bạn trên Give. Trang sao kê công khai của ngân hàng vẫn có thể hiện tên người chuyển.
          </p>
        </div>
        <Field htmlFor="pledge-message" label="Lời nhắn (không bắt buộc)">
          <textarea
            id="pledge-message"
            name="message"
            rows={3}
            maxLength={500}
            defaultValue={defaults.message}
            className="field"
          />
        </Field>
      </fieldset>

      <div className="space-y-3 border-t border-line pt-6">
        <SubmitButton className={buttonClass({ size: "lg", full: true })}>
          {changing ? "Lưu thay đổi" : "Cam kết ủng hộ"}
        </SubmitButton>
        <p className="text-center text-sm text-muted">
          Bạn chưa phải chuyển tiền bây giờ. Nếu dự án đạt mục tiêu, Give báo bạn chuyển khoản thẳng vào tài khoản của
          người tạo dự án; nếu không đạt, cam kết tự hủy.
        </p>
      </div>
    </ActionForm>
  )
}
