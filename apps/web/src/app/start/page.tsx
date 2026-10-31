import type { Metadata } from "next"

import { VerificationBadge } from "@/components/badges"
import { ActionForm, SubmitButton } from "@/components/forms"
import { requireSession } from "@/lib/auth/session"
import { getOrganizer, type Organizer } from "@/lib/campaigns"
import { dbAs } from "@/lib/supabase"

import { createCampaign, saveOrganizer } from "./actions"

export const metadata: Metadata = { title: "Tạo chiến dịch", robots: { index: false } }

export default async function StartPage() {
  const session = await requireSession("/start")
  const organizer = await getOrganizer(dbAs(session.accessToken), session.user.id)

  return (
    <div className="mx-auto max-w-3xl space-y-10 px-4 py-10">
      <div>
        <h1 className="text-3xl font-bold">Tạo chiến dịch</h1>
        <p className="mt-2 text-gray-600">
          {organizer
            ? "Bắt đầu bằng loại chiến dịch, tiêu đề và mục tiêu. Bạn sẽ viết tiếp câu chuyện, chọn danh mục và ảnh bìa ở bước sau."
            : "Trước tiên, cho chúng tôi biết ai đứng ra gây quỹ. Tên pháp lý cần khớp với tên chủ tài khoản nhận tiền."}
        </p>
      </div>

      {organizer ? (
        <>
          <section className="card p-6">
            <h2 className="mb-4 text-lg font-semibold">Chiến dịch mới</h2>
            <ActionForm action={createCampaign} className="space-y-5">
              <fieldset>
                <legend className="label">Loại chiến dịch</legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex cursor-pointer gap-3 card p-4 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                    <input type="radio" name="type" value="give" defaultChecked className="mt-1" />
                    <span>
                      <span className="font-semibold">❤️ Từ thiện</span>
                      <span className="block text-sm text-gray-600">
                        Nhận ủng hộ linh hoạt, không cần đạt đủ mục tiêu.
                      </span>
                    </span>
                  </label>
                  <label className="flex cursor-pointer gap-3 card p-4 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                    <input type="radio" name="type" value="back" className="mt-1" />
                    <span>
                      <span className="font-semibold">🚀 Dự án có quà tặng</span>
                      <span className="block text-sm text-gray-600">
                        Người ủng hộ cam kết trước, chỉ trả tiền khi dự án đạt mục tiêu.
                      </span>
                    </span>
                  </label>
                </div>
                <p className="hint">Không đổi được loại sau khi gửi duyệt.</p>
              </fieldset>
              <div>
                <label htmlFor="title" className="label">
                  Tiêu đề
                </label>
                <input id="title" name="title" className="field" required minLength={5} maxLength={120} />
              </div>
              <div>
                <label htmlFor="goal_amount" className="label">
                  Mục tiêu (₫)
                </label>
                <input
                  id="goal_amount"
                  name="goal_amount"
                  className="field"
                  inputMode="numeric"
                  placeholder="50.000.000"
                  required
                />
              </div>
              <SubmitButton>Tạo bản nháp</SubmitButton>
            </ActionForm>
          </section>

          <details className="card p-6">
            <summary className="cursor-pointer font-semibold">
              Hồ sơ người tổ chức: {organizer.display_name} <VerificationBadge status={organizer.verification_status} />
            </summary>
            <div className="mt-4">
              <OrganizerForm organizer={organizer} />
            </div>
          </details>
        </>
      ) : (
        <section className="card p-6">
          <h2 className="mb-4 text-lg font-semibold">Hồ sơ người tổ chức</h2>
          <OrganizerForm organizer={null} />
        </section>
      )}
    </div>
  )
}

function OrganizerForm({ organizer }: { organizer: Organizer | null }) {
  return (
    <ActionForm action={saveOrganizer} className="space-y-5">
      <fieldset>
        <legend className="label">Bạn gây quỹ với tư cách</legend>
        <div className="flex gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="kind" value="individual" defaultChecked={organizer?.kind !== "organization"} />
            Cá nhân
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="kind" value="organization" defaultChecked={organizer?.kind === "organization"} />
            Tổ chức
          </label>
        </div>
      </fieldset>
      <div>
        <label htmlFor="legal_name" className="label">
          Họ tên hoặc tên tổ chức theo giấy tờ
        </label>
        <input
          id="legal_name"
          name="legal_name"
          className="field"
          defaultValue={organizer?.legal_name}
          required
          minLength={2}
          maxLength={120}
        />
        <p className="hint">Không công khai. Phải khớp tên chủ tài khoản nhận tiền.</p>
      </div>
      <div>
        <label htmlFor="display_name" className="label">
          Tên hiển thị
        </label>
        <input
          id="display_name"
          name="display_name"
          className="field"
          defaultValue={organizer?.display_name}
          required
          minLength={2}
          maxLength={80}
        />
        <p className="hint">Hiện trên trang chiến dịch.</p>
      </div>
      <div>
        <label htmlFor="phone" className="label">
          Số điện thoại (không bắt buộc)
        </label>
        <input id="phone" name="phone" type="tel" className="field" defaultValue={organizer?.phone ?? ""} />
        <p className="hint">Không công khai. Kiểm duyệt viên dùng để liên hệ khi cần.</p>
      </div>
      {organizer && organizer.verification_status !== "unverified" && (
        <p className="text-sm text-amber-800">Đổi tên hoặc loại hồ sơ sẽ cần xác minh lại.</p>
      )}
      <SubmitButton>{organizer ? "Lưu hồ sơ" : "Tạo hồ sơ"}</SubmitButton>
    </ActionForm>
  )
}
