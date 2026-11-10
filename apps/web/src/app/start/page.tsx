import type { Metadata } from "next"

import { VerificationBadge } from "@/components/badges"
import { ActionForm, SubmitButton } from "@/components/forms"
import { HeartIcon, SparkIcon } from "@/components/ui/icons"
import { requireSession } from "@/lib/auth/session"
import { getOrganizer, type Organizer } from "@/lib/campaigns"
import { dbAs } from "@/lib/supabase"

import { createCampaign, saveOrganizer } from "./actions"

export const metadata: Metadata = { title: "Tạo chiến dịch", robots: { index: false } }

/** A campaign type choice: a bordered option; the checked one takes the selected fill (DESIGN.md 6). */
const TYPE_CHOICE =
  "flex cursor-pointer gap-3 rounded-md border border-border bg-raised p-4 transition-colors duration-150 hover:bg-surface has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:checked]:ring-1 has-[:checked]:ring-primary"

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
              ? "Bắt đầu bằng loại chiến dịch, tiêu đề và mục tiêu. Bạn sẽ viết tiếp câu chuyện, chọn danh mục và ảnh bìa ở bước sau."
              : "Trước tiên, cho chúng tôi biết ai đứng ra gây quỹ. Tên pháp lý cần khớp với tên chủ tài khoản nhận tiền."}
          </p>
        </div>

        {organizer ? (
          <>
            <section aria-labelledby="new-campaign-heading">
              <h2 id="new-campaign-heading" className="text-h2">
                Chiến dịch mới
              </h2>
              <ActionForm action={createCampaign} className="mt-6 space-y-6">
                <fieldset>
                  <legend className="label">Loại chiến dịch</legend>
                  <div className="grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
                    <label className={TYPE_CHOICE}>
                      <input
                        type="radio"
                        name="type"
                        value="give"
                        defaultChecked
                        className="mt-1 size-5 shrink-0 accent-primary"
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 font-semibold text-fg">
                          <HeartIcon className="text-primary" />
                          Từ thiện
                        </span>
                        <span className="mt-1 block text-sm text-fg">
                          Nhận ủng hộ linh hoạt, không cần đạt đủ mục tiêu.
                        </span>
                      </span>
                    </label>
                    <label className={TYPE_CHOICE}>
                      <input type="radio" name="type" value="back" className="mt-1 size-5 shrink-0 accent-primary" />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 font-semibold text-fg">
                          <SparkIcon className="text-accent" />
                          Dự án có quà tặng
                        </span>
                        <span className="mt-1 block text-sm text-fg">
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
  return (
    <ActionForm action={saveOrganizer} className="space-y-6">
      <fieldset>
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
      {(organizer?.verification_status === "verified" || organizer?.verification_status === "pending") && (
        <p className="text-sm text-warning">Đổi tên hoặc loại hồ sơ sẽ cần xác minh lại.</p>
      )}
      <SubmitButton>{organizer ? "Lưu hồ sơ" : "Tạo hồ sơ"}</SubmitButton>
    </ActionForm>
  )
}
