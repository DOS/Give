import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { StatusBadge } from "@/components/badges"
import { ActionForm, SubmitButton } from "@/components/forms"
import { SelectAll } from "@/components/SelectAll"
import { requireSession } from "@/lib/auth/session"
import { getCampaignById } from "@/lib/campaigns"
import { formatDateTime, formatVnd } from "@/lib/format"
import {
  canUpdateFulfillment,
  countByStatus,
  FULFILLMENT_BATCH_MAX,
  FULFILLMENT_COLORS,
  FULFILLMENT_LABELS,
  FULFILLMENT_NOTE_MAX,
  FULFILLMENT_STATUSES,
  fulfillmentLabel,
  isFulfillmentStatus,
  listFulfillmentPledges,
  parseFulfillmentFilters,
  shippingLines,
  type FulfillmentFilters,
} from "@/lib/fulfillment"
import { isUuid } from "@/lib/ids"
import { listCampaignTiers, sortTiers } from "@/lib/reward-tiers"
import { dbAs } from "@/lib/supabase"

import { setFulfillment } from "./actions"

export const metadata: Metadata = { title: "Giao quà cho người ủng hộ", robots: { index: false } }

/**
 * The creator's delivery report for a succeeded back campaign (DOS/Give#83):
 * the paid pledges, filtered by tier and delivery status, each with its own
 * status and note, plus one status and note for every ticked pledge. Read
 * under RLS with the creator's token.
 */
export default async function FulfillmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  const session = await requireSession(`/me/campaigns/${id}/fulfillment`)
  if (!isUuid(id)) notFound()
  const db = dbAs(session.accessToken)
  const campaign = await getCampaignById(db, id)
  if (!campaign || campaign.organizer_id !== session.user.id || campaign.type !== "back") notFound()

  const filters = parseFulfillmentFilters(await searchParams)
  const open = canUpdateFulfillment(campaign)
  const [tiers, { pledges, total }] = await Promise.all([
    listCampaignTiers(db, campaign.id),
    open ? listFulfillmentPledges(db, campaign.id, filters) : Promise.resolve({ pledges: [], total: 0 }),
  ])
  const tierTitle = new Map(tiers.map((t) => [t.id, t.title]))
  const counts = countByStatus(pledges)
  const filtered = filters.tier !== null || filters.status !== null

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <div>
        <Link href={`/me/campaigns/${campaign.id}`} className="text-sm text-gray-600 hover:text-gray-900">
          ← {campaign.title}
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Giao quà cho người ủng hộ</h1>
        <p className="mt-2 text-sm text-gray-600">
          Danh sách người đã thanh toán đủ. Cập nhật tình trạng giao quà (kèm ghi chú như mã vận đơn) cho từng người,
          hoặc đánh dấu nhiều người rồi cập nhật cùng lúc. Người ủng hộ thấy trạng thái và ghi chú trong mục Ủng hộ của
          tôi; ghi chú không hiện công khai. Không ghi thông tin riêng của người khác vào ghi chú.
        </p>
      </div>

      {!open ? (
        <p className="rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-700">
          Chỉ cập nhật giao quà được khi dự án đã gây quỹ thành công. Trạng thái hiện tại:{" "}
          <StatusBadge status={campaign.status} />
        </p>
      ) : (
        <>
          <form method="get" className="flex flex-wrap items-end gap-3 card p-4">
            <div>
              <label htmlFor="filter_tier" className="label">
                Phần thưởng
              </label>
              <select id="filter_tier" name="tier" className="field" defaultValue={filters.tier ?? ""}>
                <option value="">Tất cả</option>
                {sortTiers(tiers).map((tier) => (
                  <option key={tier.id} value={tier.id}>
                    {tier.title}
                  </option>
                ))}
                <option value="none">Không nhận quà</option>
              </select>
            </div>
            <div>
              <label htmlFor="filter_status" className="label">
                Tình trạng giao quà
              </label>
              <select id="filter_status" name="status" className="field" defaultValue={filters.status ?? ""}>
                <option value="">Tất cả</option>
                <option value="none">Chưa cập nhật</option>
                {FULFILLMENT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {FULFILLMENT_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className="btn-secondary">
              Lọc
            </button>
            {filtered && (
              <Link href={`/me/campaigns/${campaign.id}/fulfillment`} className="text-sm text-brand-600">
                Bỏ lọc
              </Link>
            )}
          </form>

          {pledges.length === 0 ? (
            <p className="card p-6 text-sm text-gray-600">
              {filtered ? "Không có lượt ủng hộ nào khớp bộ lọc." : "Chưa có người ủng hộ nào thanh toán đủ."}
            </p>
          ) : (
            <FulfillmentForm
              campaignId={campaign.id}
              pledges={pledges}
              total={total}
              tierTitle={tierTitle}
              counts={counts}
              filters={filters}
            />
          )}
        </>
      )}
    </div>
  )
}

function FulfillmentForm({
  campaignId,
  pledges,
  total,
  tierTitle,
  counts,
  filters,
}: {
  campaignId: string
  pledges: Awaited<ReturnType<typeof listFulfillmentPledges>>["pledges"]
  total: number
  tierTitle: Map<string, string>
  counts: ReturnType<typeof countByStatus>
  filters: FulfillmentFilters
}) {
  return (
    <ActionForm action={setFulfillment.bind(null, campaignId)} className="space-y-4">
      {/* Enter in a field must not submit: the default button is disabled (each row and the bulk bar have their own). */}
      <button type="submit" disabled hidden aria-hidden tabIndex={-1} />

      <p className="text-sm text-gray-600">
        {total > pledges.length
          ? `Hiện ${pledges.length} trong ${total} lượt (tối đa ${FULFILLMENT_BATCH_MAX} mỗi lần). Cập nhật xong, lọc theo "Chưa cập nhật" để xem tiếp.`
          : `${pledges.length} lượt ủng hộ${filters.tier || filters.status ? " khớp bộ lọc" : ""}.`}{" "}
        {counts.none > 0 && `${counts.none} chưa cập nhật. `}
        {FULFILLMENT_STATUSES.filter((s) => counts[s] > 0)
          .map((s) => `${counts[s]} ${FULFILLMENT_LABELS[s].toLowerCase()}`)
          .join(", ")}
      </p>

      <fieldset className="space-y-3 card p-4">
        <legend className="px-1 text-sm font-semibold">Cập nhật nhiều người cùng lúc</legend>
        <SelectAll name="contribution_id" label="Chọn tất cả trong danh sách" />
        <div className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="bulk_status" className="label">
              Trạng thái
            </label>
            <select id="bulk_status" name="status" className="field" defaultValue="in_progress">
              {FULFILLMENT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {FULFILLMENT_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="bulk_note" className="label">
              Ghi chú (thay ghi chú cũ của những người đã chọn; để trống là xóa ghi chú cũ)
            </label>
            <input
              id="bulk_note"
              name="note"
              className="field"
              maxLength={FULFILLMENT_NOTE_MAX}
              placeholder="Ví dụ: đã gửi qua Giao Hàng Nhanh ngày 10/03"
            />
          </div>
          <SubmitButton>Cập nhật những người đã chọn</SubmitButton>
        </div>
      </fieldset>

      <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200">
        {pledges.map((pledge) => {
          const address = shippingLines(pledge.shipping_address)
          const status = isFulfillmentStatus(pledge.fulfillment_status) ? pledge.fulfillment_status : null
          return (
            <li key={pledge.id} className="grid gap-3 p-4 text-sm lg:grid-cols-[1fr_22rem]">
              <div className="flex min-w-0 gap-3">
                <input
                  type="checkbox"
                  name="contribution_id"
                  value={pledge.id}
                  aria-label={`Chọn lượt ${pledge.reference_code}`}
                  className="mt-1"
                />
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{pledge.public_name ?? "Người ủng hộ"}</span>
                    {pledge.is_anonymous && (
                      <span className="text-xs text-gray-500">(ẩn danh trên trang công khai)</span>
                    )}
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        status ? FULFILLMENT_COLORS[status] : "bg-amber-50 text-amber-800"
                      }`}
                    >
                      {fulfillmentLabel(status)}
                    </span>
                  </div>
                  <p className="text-gray-600">
                    {pledge.reward_tier_id ? (tierTitle.get(pledge.reward_tier_id) ?? "Phần thưởng") : "Không nhận quà"}{" "}
                    · {formatVnd(pledge.intended_amount)} · Mã {pledge.reference_code}
                  </p>
                  {address.length > 0 && (
                    <address className="text-gray-700 not-italic">
                      {address.map((line, i) => (
                        <span key={i} className="block break-words">
                          {line}
                        </span>
                      ))}
                    </address>
                  )}
                  {pledge.fulfillment_note && (
                    <p className="break-words text-gray-600">Ghi chú: {pledge.fulfillment_note}</p>
                  )}
                  {pledge.fulfillment_updated_at && (
                    <p className="text-xs text-gray-500">
                      Cập nhật lúc {formatDateTime(pledge.fulfillment_updated_at)}
                    </p>
                  )}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
                <select
                  name={`status_${pledge.id}`}
                  aria-label={`Trạng thái giao quà của ${pledge.reference_code}`}
                  className="field"
                  defaultValue={status ?? "pending"}
                >
                  {FULFILLMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {FULFILLMENT_LABELS[s]}
                    </option>
                  ))}
                </select>
                <input
                  name={`note_${pledge.id}`}
                  aria-label={`Ghi chú giao quà của ${pledge.reference_code}`}
                  className="field"
                  maxLength={FULFILLMENT_NOTE_MAX}
                  placeholder="Ghi chú"
                  defaultValue={pledge.fulfillment_note ?? ""}
                />
                <div className="sm:col-span-2">
                  <SubmitButton className="btn-secondary px-3 py-1" name="only" value={pledge.id}>
                    Lưu cho người này
                  </SubmitButton>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </ActionForm>
  )
}
