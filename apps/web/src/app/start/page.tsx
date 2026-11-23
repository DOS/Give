import type { Metadata } from "next"

import { VerificationBadge } from "@/components/badges"
import { ActionForm, SubmitButton } from "@/components/forms"
import { requireSession } from "@/lib/auth/session"
import { getOrganizer, type Organizer } from "@/lib/campaigns"
import { dbAs } from "@/lib/supabase"

import { createCampaign, saveOrganizer } from "./actions"
import { StartCampaignForm } from "./StartCampaignForm"

export const metadata: Metadata = { title: "Tạo chiến dịch", robots: { index: false } }

export default async function StartPage() {
  const session = await requireSession("/start")
  const organizer = await getOrganizer(dbAs(session.accessToken), session.user.id)

  return (
    <div className="container-page pt-8 pb-16 sm:pt-12 lg:pb-24">
      <div className="max-w-160 space-y-12">
        <div>
          <h1 className="text-h1-phone tracking-tight sm:text-h1">Tạo chiến dịch</h1>
          <p className="mt-3 max-w-[68ch] text-fg">
            {organizer
              ? "Chọn mẫu gợi ý hoặc bắt đầu bằng loại chiến dịch, tiêu đề và mục tiêu. Bạn có thể chỉnh sửa câu chuyện, danh mục và ảnh bìa ở bước sau."
              : "Trước tiên, cho chúng tôi biết ai đứng ra gây quỹ. Tên pháp lý cần khớp với tên chủ tài khoản nhận tiền."}
          </p>
        </div>

        {organizer ? (
          <>
            <section aria-labelledby="new-campaign-heading">
              <h2 id="new-campaign-heading" className="text-h2">
                Chiến dịch mới
              </h2>
              <StartCampaignForm action={createCampaign} />
            </section>

            <details className="border-t border-border pt-6">
              <summary className="min-h-11 cursor-pointer py-2 font-semibold break-words text-fg">
                Hồ sơ người tổ chức: {organizer.display_name}{" "}
                <VerificationBadge status={organizer.verification_status} />
              </summary>
              <div className="mt-6">
                <OrganizerForm organizer={organizer} />
              </div>
            </details>
          </>
        ) : (
          <section aria-labelledby="organizer-heading">
            <h2 id="organizer-heading" className="text-h2">
              Hồ sơ người tổ chức
            </h2>
            <div className="mt-6">
              <OrganizerForm organizer={null} />
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function OrganizerForm({ organizer }: { organizer: Organizer | null }) {
  const warnsReverify = organizer?.verification_status === "verified" || organizer?.verification_status === "pending"
  return (
    <ActionForm action={saveOrganizer} className="space-y-6">
      <fieldset aria-describedby={warnsReverify ? "organizer_reverify_hint" : undefined}>
        <legend className="label">Bạn gây quỹ với tư cách</legend>
        <div className="flex flex-wrap gap-x-8">
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-fg">
            <input
              type="radio"
              name="kind"
              value="individual"
              defaultChecked={organizer?.kind !== "organization"}
              className="size-5 shrink-0 accent-primary"
            />
            Cá nhân
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-fg">
            <input
              type="radio"
              name="kind"
              value="organization"
              defaultChecked={organizer?.kind === "organization"}
              className="size-5 shrink-0 accent-primary"
            />
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
          aria-describedby={warnsReverify ? "legal_name_hint organizer_reverify_hint" : "legal_name_hint"}
        />
        <p id="legal_name_hint" className="hint">
          Không công khai. Phải khớp tên chủ tài khoản nhận tiền.
        </p>
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
          aria-describedby={warnsReverify ? "display_name_hint organizer_reverify_hint" : "display_name_hint"}
        />
        <p id="display_name_hint" className="hint">
          Hiện trên trang chiến dịch.
        </p>
      </div>
      <div>
        <label htmlFor="phone" className="label">
          Số điện thoại (không bắt buộc)
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          className="field"
          maxLength={20}
          aria-describedby="phone_hint"
          defaultValue={organizer?.phone ?? ""}
        />
        <p id="phone_hint" className="hint">
          Không công khai. Kiểm duyệt viên dùng để liên hệ khi cần.
        </p>
      </div>
      {warnsReverify && (
        <p id="organizer_reverify_hint" className="text-sm text-warning">
          Đổi tên hoặc loại hồ sơ sẽ cần xác minh lại.
        </p>
      )}
      <SubmitButton>{organizer ? "Lưu hồ sơ" : "Tạo hồ sơ"}</SubmitButton>
    </ActionForm>
  )
}
