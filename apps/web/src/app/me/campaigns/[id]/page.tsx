import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"

import { StatusBadge, TypeBadge } from "@/components/badges"
import { ActionForm, SubmitButton } from "@/components/forms"
import { requireSession } from "@/lib/auth/session"
import {
  canPostUpdate,
  categoriesFor,
  getCampaignById,
  isEditableStatus,
  isPublicStatus,
  listAllUpdates,
  listCategories,
  listMilestones,
  organizerCanCancel,
} from "@/lib/campaigns"
import { formatDate, formatVnd, toVietnamLocalInput } from "@/lib/format"
import { isUuid } from "@/lib/ids"
import { privateCoverUrl } from "@/lib/cover-urls"
import { getMoneyTotals } from "@/lib/statement"
import { dbAs } from "@/lib/supabase"

import {
  addMilestone,
  cancelCampaign,
  deleteDraft,
  deleteMilestone,
  postUpdate,
  saveContent,
  submitForReview,
  uploadCover,
} from "../actions"

export const metadata: Metadata = { title: "Quản lý chiến dịch", robots: { index: false } }

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await requireSession(`/me/campaigns/${id}`)
  if (!isUuid(id)) notFound()
  const db = dbAs(session.accessToken)
  const campaign = await getCampaignById(db, id)
  if (!campaign || campaign.organizer_id !== session.user.id) notFound()

  const [categories, milestones, updates, totals] = await Promise.all([
    listCategories(db),
    listMilestones(db, campaign.id),
    listAllUpdates(db, campaign.id),
    isPublicStatus(campaign.status) ? getMoneyTotals(db, campaign.id) : Promise.resolve(null),
  ])
  const editable = isEditableStatus(campaign.status)
  const isGive = campaign.type === "give"
  const showUpdates = canPostUpdate(campaign.status) && !editable && campaign.status !== "in_review"

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-4 py-10">
      <div>
        <Link href="/me/campaigns" className="text-sm text-gray-600 hover:text-gray-900">
          ← Chiến dịch của tôi
        </Link>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <TypeBadge type={campaign.type} />
          <StatusBadge status={campaign.status} />
        </div>
        <h1 className="mt-2 text-3xl font-bold">{campaign.title}</h1>
        <Link href={`/campaigns/${campaign.slug}`} className="mt-1 inline-block text-sm text-brand-600">
          {isPublicStatus(campaign.status) ? "Xem trang công khai" : "Xem trước trang chiến dịch"} →
        </Link>
      </div>

      <StatusNotice status={campaign.status} reviewNote={campaign.review_note} />

      {(totals || !isEditableStatus(campaign.status)) && (
        <section className="flex flex-wrap items-center justify-between gap-3 card p-6">
          <div>
            <h2 className="text-lg font-semibold">Sao kê và giải trình chi</h2>
            {totals ? (
              <p className={`text-sm ${totals.unexplained_out_count > 0 ? "text-amber-700" : "text-gray-600"}`}>
                {totals.unexplained_out_count > 0
                  ? `${totals.unexplained_out_count} khoản chi chưa giải trình (công khai trên trang chiến dịch).`
                  : "Mọi khoản chi đã được giải trình."}
              </p>
            ) : (
              <p className="text-sm text-gray-600">Các khoản tiền ra từ tài khoản nhận của chiến dịch.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/me/campaigns/${campaign.id}/unmatched`} className="btn-secondary">
              Khớp tiền vào chưa có mã
            </Link>
            <Link href={`/me/campaigns/${campaign.id}/disbursements`} className="btn-secondary">
              Giải trình khoản chi
            </Link>
          </div>
        </section>
      )}

      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Nội dung</h2>
        <ActionForm action={saveContent.bind(null, campaign.id)}>
          <fieldset disabled={!editable} className="space-y-5">
            <div>
              <label htmlFor="title" className="label">
                Tiêu đề
              </label>
              <input
                id="title"
                name="title"
                className="field"
                defaultValue={campaign.title}
                required
                minLength={5}
                maxLength={120}
              />
            </div>
            <div>
              <label htmlFor="category_id" className="label">
                Danh mục
              </label>
              <select id="category_id" name="category_id" className="field" defaultValue={campaign.category_id ?? ""}>
                <option value="">Chọn danh mục</option>
                {categoriesFor(categories, campaign.type).map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.icon} {category.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="summary" className="label">
                Tóm tắt
              </label>
              <textarea
                id="summary"
                name="summary"
                className="field"
                rows={2}
                maxLength={200}
                defaultValue={campaign.summary ?? ""}
              />
              <p className="hint">Tối đa 200 ký tự, hiện trên thẻ chiến dịch.</p>
            </div>
            <div>
              <label htmlFor="story" className="label">
                Câu chuyện
              </label>
              <textarea
                id="story"
                name="story"
                className="field font-mono"
                rows={12}
                maxLength={50000}
                defaultValue={campaign.story ?? ""}
              />
              <p className="hint">Ít nhất 100 ký tự. Hỗ trợ Markdown (tiêu đề, danh sách, liên kết).</p>
            </div>

            {isGive && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="beneficiary_name" className="label">
                    Người thụ hưởng
                  </label>
                  <input
                    id="beneficiary_name"
                    name="beneficiary_name"
                    className="field"
                    maxLength={120}
                    defaultValue={campaign.beneficiary_name ?? ""}
                  />
                </div>
                <div>
                  <label htmlFor="beneficiary_relation" className="label">
                    Quan hệ với bạn
                  </label>
                  <input
                    id="beneficiary_relation"
                    name="beneficiary_relation"
                    className="field"
                    maxLength={120}
                    placeholder="Ví dụ: bản thân, người thân, cộng đồng…"
                    defaultValue={campaign.beneficiary_relation ?? ""}
                  />
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="goal_amount" className="label">
                  Mục tiêu (₫)
                </label>
                <input
                  id="goal_amount"
                  name="goal_amount"
                  className="field"
                  inputMode="numeric"
                  required
                  defaultValue={String(campaign.goal_amount)}
                />
              </div>
              <div>
                <label htmlFor="min_contribution" className="label">
                  Góp tối thiểu (₫)
                </label>
                <input
                  id="min_contribution"
                  name="min_contribution"
                  className="field"
                  inputMode="numeric"
                  required
                  defaultValue={String(campaign.min_contribution)}
                />
              </div>
              {!isGive && (
                <>
                  <div>
                    <label htmlFor="stretch_goal_amount" className="label">
                      Mục tiêu mở rộng (₫, không bắt buộc)
                    </label>
                    <input
                      id="stretch_goal_amount"
                      name="stretch_goal_amount"
                      className="field"
                      inputMode="numeric"
                      defaultValue={campaign.stretch_goal_amount ? String(campaign.stretch_goal_amount) : ""}
                    />
                  </div>
                  <div>
                    <label htmlFor="payment_window_days" className="label">
                      Số ngày để người ủng hộ thanh toán
                    </label>
                    <input
                      id="payment_window_days"
                      name="payment_window_days"
                      type="number"
                      min={1}
                      max={30}
                      className="field"
                      defaultValue={campaign.payment_window_days}
                    />
                  </div>
                </>
              )}
              <div>
                <label htmlFor="starts_at" className="label">
                  Bắt đầu (giờ Việt Nam, không bắt buộc)
                </label>
                <input
                  id="starts_at"
                  name="starts_at"
                  type="datetime-local"
                  className="field"
                  defaultValue={toVietnamLocalInput(campaign.starts_at)}
                />
                <p className="hint">Để trống thì mở ngay khi được duyệt.</p>
              </div>
              <div>
                <label htmlFor="ends_at" className="label">
                  Kết thúc (giờ Việt Nam)
                </label>
                <input
                  id="ends_at"
                  name="ends_at"
                  type="datetime-local"
                  className="field"
                  defaultValue={toVietnamLocalInput(campaign.ends_at)}
                />
                {!isGive && <p className="hint">Dự án có quà tặng gây quỹ tối đa 60 ngày.</p>}
              </div>
            </div>

            <fieldset>
              <legend className="label">Hiển thị trên trang công khai</legend>
              <div className="flex flex-wrap gap-6 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="show_progress_bar"
                    defaultChecked={campaign.display_options.progress_bar !== false}
                  />
                  Thanh tiến độ
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="show_backers_count"
                    defaultChecked={campaign.display_options.backers_count !== false}
                  />
                  Số người ủng hộ
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="show_time_remaining"
                    defaultChecked={campaign.display_options.time_remaining !== false}
                  />
                  Thời gian còn lại
                </label>
              </div>
            </fieldset>

            {editable && <SubmitButton>Lưu nội dung</SubmitButton>}
          </fieldset>
        </ActionForm>
      </section>

      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Ảnh bìa</h2>
        <div className="grid gap-6 sm:grid-cols-2">
          <div className="relative aspect-[16/9] overflow-hidden rounded-md bg-gray-100">
            {campaign.cover?.storage_path ? (
              <Image
                src={privateCoverUrl(campaign.cover.storage_path)}
                unoptimized
                alt={campaign.cover.alt ?? campaign.title}
                fill
                sizes="(min-width: 640px) 50vw, 100vw"
                className="object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-gray-400">Chưa có ảnh bìa</div>
            )}
          </div>
          {editable && (
            <ActionForm action={uploadCover.bind(null, campaign.id)} resetOnSuccess className="space-y-3">
              <div>
                <label htmlFor="cover" className="label">
                  Chọn ảnh
                </label>
                <input
                  id="cover"
                  name="cover"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  required
                  className="block w-full text-sm"
                />
                <p className="hint">JPEG, PNG hoặc WebP, tối đa 4 MB. Nên dùng tỉ lệ 16:9.</p>
              </div>
              <div>
                <label htmlFor="alt" className="label">
                  Mô tả ảnh (không bắt buộc)
                </label>
                <input id="alt" name="alt" className="field" maxLength={200} />
              </div>
              <SubmitButton>Tải ảnh lên</SubmitButton>
            </ActionForm>
          )}
        </div>
      </section>

      <section className="card p-6">
        <h2 className="mb-4 text-lg font-semibold">Các mốc mục tiêu</h2>
        {milestones.length > 0 ? (
          <ul className="mb-6 divide-y divide-gray-100">
            {milestones.map((milestone) => (
              <li key={milestone.id} className="flex items-start justify-between gap-4 py-3">
                <div>
                  <p className="font-medium">
                    {milestone.title} · {formatVnd(milestone.target_amount)}
                  </p>
                  {milestone.description && <p className="text-sm text-gray-600">{milestone.description}</p>}
                </div>
                {editable && (
                  <ActionForm action={deleteMilestone.bind(null, campaign.id, milestone.id)}>
                    <SubmitButton className="btn-danger px-3 py-1">Xóa</SubmitButton>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-6 text-sm text-gray-500">Chưa có mốc nào. Mốc giúp người ủng hộ thấy tiền sẽ làm được gì.</p>
        )}
        {editable && (
          <ActionForm
            action={addMilestone.bind(null, campaign.id)}
            resetOnSuccess
            className="grid gap-3 sm:grid-cols-2"
          >
            <div>
              <label htmlFor="milestone_title" className="label">
                Tên mốc
              </label>
              <input id="milestone_title" name="title" className="field" required minLength={2} maxLength={120} />
            </div>
            <div>
              <label htmlFor="milestone_target" className="label">
                Số tiền (₫)
              </label>
              <input id="milestone_target" name="target_amount" className="field" inputMode="numeric" required />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="milestone_description" className="label">
                Mô tả (không bắt buộc)
              </label>
              <input id="milestone_description" name="description" className="field" maxLength={2000} />
            </div>
            <div>
              <SubmitButton className="btn-secondary">Thêm mốc</SubmitButton>
            </div>
          </ActionForm>
        )}
      </section>

      {showUpdates && (
        <section className="card p-6">
          <h2 className="mb-4 text-lg font-semibold">Cập nhật cho người ủng hộ</h2>
          <ActionForm
            action={postUpdate.bind(null, campaign.id)}
            resetOnSuccess
            className="space-y-3"
            confirm="Cập nhật sẽ công khai ngay và không sửa được. Đăng?"
          >
            <div>
              <label htmlFor="update_title" className="label">
                Tiêu đề
              </label>
              <input id="update_title" name="title" className="field" required minLength={2} maxLength={200} />
            </div>
            <div>
              <label htmlFor="update_body" className="label">
                Nội dung
              </label>
              <textarea id="update_body" name="body" className="field" rows={5} required maxLength={50000} />
            </div>
            <SubmitButton>Đăng cập nhật</SubmitButton>
          </ActionForm>
          {updates.length > 0 && (
            <ul className="mt-6 space-y-2 text-sm">
              {updates.map((update) => (
                <li key={update.id}>
                  <span className="text-gray-500">{formatDate(update.published_at ?? update.created_at)}</span> ·{" "}
                  {update.title}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="space-y-4 card p-6">
        <h2 className="text-lg font-semibold">Trạng thái</h2>
        {editable && (
          <ActionForm action={submitForReview.bind(null, campaign.id)}>
            <p className="mb-3 text-sm text-gray-600">
              Khi gửi duyệt, bạn không sửa được nội dung cho tới khi kiểm duyệt viên trả lời. Cần có danh mục, tóm tắt,
              câu chuyện ít nhất 100 ký tự, ngày kết thúc
              {isGive ? " và người thụ hưởng" : ""}.
            </p>
            <SubmitButton>Gửi duyệt</SubmitButton>
          </ActionForm>
        )}
        {organizerCanCancel(campaign.status) && (
          <ActionForm
            action={cancelCampaign.bind(null, campaign.id)}
            className="space-y-2"
            confirm="Hủy chiến dịch là vĩnh viễn. Tiếp tục?"
          >
            <label htmlFor="cancel_reason" className="label">
              Hủy chiến dịch
            </label>
            <input
              id="cancel_reason"
              name="reason"
              className="field"
              placeholder="Lý do (không bắt buộc)"
              maxLength={500}
            />
            <SubmitButton className="btn-danger">Hủy chiến dịch</SubmitButton>
          </ActionForm>
        )}
        {campaign.status === "draft" && (
          <ActionForm action={deleteDraft.bind(null, campaign.id)} confirm="Xóa hẳn bản nháp này?">
            <SubmitButton className="btn-danger">Xóa bản nháp</SubmitButton>
          </ActionForm>
        )}
        {!editable && !organizerCanCancel(campaign.status) && (
          <p className="text-sm text-gray-600">Không có thao tác nào ở trạng thái này.</p>
        )}
      </section>
    </div>
  )
}

function StatusNotice({ status, reviewNote }: { status: string; reviewNote: string | null }) {
  const notices: Record<string, { tone: string; text: string }> = {
    draft: { tone: "bg-gray-50 text-gray-700", text: "Bản nháp: chỉ bạn thấy. Hoàn thiện nội dung rồi gửi duyệt." },
    in_review: { tone: "bg-amber-50 text-amber-900", text: "Đang chờ kiểm duyệt. Nội dung tạm khóa." },
    changes_requested: {
      tone: "bg-orange-50 text-orange-900",
      text: `Kiểm duyệt viên yêu cầu chỉnh sửa${reviewNote ? `: ${reviewNote}` : "."} Sửa xong thì gửi duyệt lại.`,
    },
    approved: { tone: "bg-sky-50 text-sky-900", text: "Đã duyệt. Chiến dịch tự mở khi tới ngày bắt đầu." },
    live: { tone: "bg-green-50 text-green-900", text: "Chiến dịch đang công khai." },
    suspended: {
      tone: "bg-red-50 text-red-900",
      text: `Chiến dịch đang tạm dừng${reviewNote ? `: ${reviewNote}` : "."}`,
    },
    cancelled: { tone: "bg-gray-50 text-gray-700", text: "Chiến dịch đã hủy." },
  }
  const notice = notices[status]
  if (!notice) return null
  return <p className={`rounded-md px-4 py-3 text-sm ${notice.tone}`}>{notice.text}</p>
}
