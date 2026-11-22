import Link from "next/link"

import { ActionForm, SubmitButton } from "@/components/forms"
import { Badge } from "@/components/ui/Badge"
import { buttonClass } from "@/components/ui/Button"
import { isEditableStatus, isPublicPrelaunch, type CampaignStatus } from "@/lib/campaigns"
import { formatDate } from "@/lib/format"

import { Panel } from "../../_components/Panel"
import { setCampaignPrelaunchPublic } from "../actions"

const PRELAUNCH_TOGGLE_STATUSES: readonly CampaignStatus[] = ["draft", "changes_requested", "in_review", "approved"]
const COUNT_FORMAT = new Intl.NumberFormat("vi-VN")

/** Whether the campaign workspace shows the pre-launch "Sắp ra mắt" section. */
export function showPrelaunchSection(status: CampaignStatus): boolean {
  return PRELAUNCH_TOGGLE_STATUSES.includes(status)
}

/** Reads campaigns.prelaunch_public (DOS-Me 20261201120000) safely from the campaign row. */
export function campaignPrelaunchPublic(campaign: object): boolean {
  return (campaign as { prelaunch_public?: unknown }).prelaunch_public === true
}

/**
 * Pre-launch "Sắp ra mắt" opt-in section in `/me/campaigns/[id]` (DOS/Give#315).
 *
 * Allows the owner or an accepted co-organizer editor to opt into public teaser
 * visibility before the campaign opens. When enabled on an approved campaign
 * with a future `starts_at`, visitors see the story and can click "Nhận thông
 * báo khi mở", while receiving accounts, VietQR, donations and pledges stay
 * strictly blocked until `live`.
 */
export function PrelaunchSection({
  campaignId,
  slug,
  status,
  startsAt,
  prelaunchPublic,
  followerCount = 0,
  now = new Date(),
}: {
  campaignId: string
  slug: string
  status: CampaignStatus
  startsAt: string | null
  prelaunchPublic: boolean
  followerCount?: number
  now?: Date
}) {
  const hasFutureStart = startsAt !== null && !Number.isNaN(Date.parse(startsAt)) && new Date(startsAt) > now
  const liveTeaser = isPublicPrelaunch({ status, prelaunch_public: prelaunchPublic, starts_at: startsAt }, now)
  const needsFutureStartToEnable = status === "approved" && !hasFutureStart

  return (
    <Panel
      id="prelaunch"
      title="Trang giới thiệu Sắp ra mắt"
      description={
        <div className="max-w-[68ch] space-y-2">
          <p>
            Khi bật, ngay sau khi chiến dịch được duyệt và trước ngày bắt đầu, Give hiển thị trang giới thiệu “Sắp ra
            mắt” để mọi người đọc trước câu chuyện và bấm “Nhận thông báo khi mở”.
          </p>
          <p>
            Trong giai đoạn Sắp ra mắt, tài khoản nhận tiền, mã VietQR, ủng hộ và cam kết vẫn hoàn toàn đóng cho tới khi
            chiến dịch chính thức mở.
          </p>
        </div>
      }
    >
      <div className="max-w-160 space-y-6">
        <p className="flex flex-wrap items-center gap-2 text-fg">
          Trạng thái: {prelaunchPublic ? <Badge tone="info">Đang bật</Badge> : <Badge>Đang tắt</Badge>}
          {liveTeaser && (
            <span className="text-sm text-muted">
              Đang hiển thị công khai · mở ngày {formatDate(startsAt)}
              {followerCount > 0 ? ` · ${COUNT_FORMAT.format(followerCount)} người đang chờ` : ""}
            </span>
          )}
          {prelaunchPublic && !liveTeaser && status === "approved" && (
            <span className="text-sm text-warning">
              Chưa hiển thị công khai (không có ngày bắt đầu trong tương lai)
            </span>
          )}
        </p>

        {liveTeaser && (
          <p className="text-sm">
            <Link href={`/campaigns/${slug}`} className="link">
              Xem trang Sắp ra mắt công khai
            </Link>
          </p>
        )}

        {prelaunchPublic ? (
          <ActionForm
            action={setCampaignPrelaunchPublic.bind(null, campaignId)}
            className="space-y-4 border-t border-border pt-6"
          >
            <input type="hidden" name="enabled" value="false" />
            {!hasFutureStart && isEditableStatus(status) && (
              <p className="text-sm text-muted">
                Nhớ đặt ngày bắt đầu trong tương lai trước khi gửi duyệt để trang Sắp ra mắt tự động hiển thị sau khi
                được duyệt.
              </p>
            )}
            {!hasFutureStart && status === "in_review" && (
              <p className="text-sm text-muted">
                Chiến dịch đang chờ duyệt và chưa có ngày bắt đầu trong tương lai, nên khi được duyệt sẽ mở ngay thay vì
                qua giai đoạn Sắp ra mắt.
              </p>
            )}
            {!hasFutureStart && status === "approved" && (
              <p className="text-sm text-warning">
                Trang Sắp ra mắt không hiển thị công khai vì chiến dịch không còn ngày bắt đầu trong tương lai. Bạn có
                thể tắt chế độ này.
              </p>
            )}
            <SubmitButton className={buttonClass({ variant: "secondary" })}>Tắt chế độ Sắp ra mắt</SubmitButton>
          </ActionForm>
        ) : (
          <ActionForm
            action={setCampaignPrelaunchPublic.bind(null, campaignId)}
            className="space-y-4 border-t border-border pt-6"
          >
            <input type="hidden" name="enabled" value="true" />
            {needsFutureStartToEnable && (
              <p className="text-warning">
                Chiến dịch đã được duyệt nhưng không có ngày bắt đầu trong tương lai, nên không thể bật chế độ Sắp ra
                mắt.
              </p>
            )}
            {!hasFutureStart && isEditableStatus(status) && (
              <p className="text-sm text-muted">
                Bạn có thể bật trước tại đây; hãy đặt ngày bắt đầu trong tương lai ở mục Nội dung để trang Sắp ra mắt
                hiển thị công khai sau khi được duyệt.
              </p>
            )}
            {!hasFutureStart && status === "in_review" && (
              <p className="text-sm text-muted">
                Chiến dịch đang chờ duyệt và chưa có ngày bắt đầu trong tương lai. Nếu muốn hiển thị trang Sắp ra mắt
                trước khi mở, chiến dịch cần có ngày bắt đầu trong tương lai trước khi được duyệt.
              </p>
            )}
            <SubmitButton className={buttonClass({ variant: "secondary" })} disabled={needsFutureStartToEnable}>
              Bật chế độ Sắp ra mắt
            </SubmitButton>
          </ActionForm>
        )}
      </div>
    </Panel>
  )
}
