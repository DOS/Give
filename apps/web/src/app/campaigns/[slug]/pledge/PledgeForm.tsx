"use client"

import { useState } from "react"

import { ActionForm, SubmitButton } from "@/components/forms"
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
    <ActionForm action={action} className="space-y-6">
      <fieldset className="space-y-3">
        <legend className="mb-2 font-semibold">Chọn phần quà</legend>
        {tiers.map((t) => {
          const soldOut = isSoldOut(t) && t.id !== defaults.tier
          const month = deliveryMonth(t.estimated_delivery)
          return (
            <label
              key={t.id}
              className={`flex cursor-pointer gap-3 card p-4 ${tierId === t.id ? "border-brand-500 ring-1 ring-brand-500" : ""} ${
                soldOut ? "cursor-not-allowed opacity-60" : ""
              }`}
            >
              <input
                type="radio"
                name="tier"
                value={t.id}
                checked={tierId === t.id}
                disabled={soldOut}
                required
                onChange={() => choose(t.id)}
                className="mt-1"
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-semibold">{t.title}</span>
                  <span className="text-sm font-medium text-gray-700">Từ {formatVnd(t.min_amount)}</span>
                </span>
                {t.description && (
                  <span className="mt-1 block text-sm whitespace-pre-line text-gray-600">{t.description}</span>
                )}
                <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
                  {month && <span>Dự kiến giao: {month}</span>}
                  {t.requires_shipping && <span>Cần địa chỉ nhận quà</span>}
                  {soldOut ? (
                    <span className="font-medium text-red-700">Đã hết suất</span>
                  ) : (
                    t.quantity_remaining !== null && <span>Còn {t.quantity_remaining} suất</span>
                  )}
                </span>
              </span>
            </label>
          )
        })}
        <label
          className={`flex cursor-pointer gap-3 card p-4 ${tierId === NO_REWARD ? "border-brand-500 ring-1 ring-brand-500" : ""}`}
        >
          <input
            type="radio"
            name="tier"
            value={NO_REWARD}
            checked={tierId === NO_REWARD}
            required
            onChange={() => choose(NO_REWARD)}
            className="mt-1"
          />
          <span>
            <span className="font-semibold">Ủng hộ không nhận quà</span>
            <span className="mt-1 block text-sm text-gray-600">
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
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          className="field"
        />
        <p className="hint">Tối thiểu {formatVnd(minimum)} cho lựa chọn này.</p>
      </div>

      {tier?.requires_shipping && (
        <fieldset className="space-y-4 rounded-lg border border-gray-200 p-4">
          <legend className="px-1 font-semibold">Địa chỉ nhận quà</legend>
          {tier.shipping_note && <p className="text-sm text-gray-600">{tier.shipping_note}</p>}
          <div>
            <label htmlFor="ship-recipient" className="label">
              Người nhận
            </label>
            <input
              id="ship-recipient"
              name="ship_recipient"
              required
              maxLength={80}
              autoComplete="shipping name"
              defaultValue={defaults.shipping?.recipient ?? ""}
              className="field"
            />
          </div>
          <div>
            <label htmlFor="ship-phone" className="label">
              Số điện thoại
            </label>
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
          </div>
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
              defaultValue={defaults.shipping?.address ?? ""}
              className="field"
            />
            <p className="hint">
              Chỉ người tạo dự án thấy địa chỉ này, để gửi quà. Give không tính phí vận chuyển; nếu có, người tạo dự án
              ghi rõ ở phần quà.
            </p>
          </div>
        </fieldset>
      )}

      <div>
        <label htmlFor="pledge-name" className="label">
          Tên hiển thị
        </label>
        <input
          id="pledge-name"
          name="public_name"
          maxLength={80}
          defaultValue={defaults.public_name}
          autoComplete="name"
          className="field"
        />
      </div>
      <div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="anonymous" defaultChecked={defaults.anonymous} className="mt-0.5" />
          <span>Ủng hộ ẩn danh</span>
        </label>
        <p className="hint">
          Give sẽ không hiện tên bạn trên Give. Trang sao kê công khai của ngân hàng vẫn có thể hiện tên người chuyển.
        </p>
      </div>
      <div>
        <label htmlFor="pledge-message" className="label">
          Lời nhắn (không bắt buộc)
        </label>
        <textarea
          id="pledge-message"
          name="message"
          rows={3}
          maxLength={500}
          defaultValue={defaults.message}
          className="field"
        />
      </div>

      <SubmitButton className="btn-primary w-full">{changing ? "Lưu thay đổi" : "Cam kết ủng hộ"}</SubmitButton>
      <p className="text-center text-xs text-gray-500">
        Bạn chưa phải chuyển tiền bây giờ. Nếu dự án đạt mục tiêu, Give báo bạn chuyển khoản thẳng vào tài khoản của
        người tạo dự án; nếu không đạt, cam kết tự hủy.
      </p>
    </ActionForm>
  )
}
