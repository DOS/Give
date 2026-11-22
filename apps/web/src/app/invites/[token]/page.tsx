import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { ActionForm, SubmitButton } from "@/components/forms"
import { Badge } from "@/components/ui/Badge"
import { buttonClass, ButtonLink } from "@/components/ui/Button"
import { Callout } from "@/components/ui/Callout"
import { EmptyState } from "@/components/ui/EmptyState"
import { UsersIcon } from "@/components/ui/icons"
import { getSession } from "@/lib/auth/session"
import {
  getMyCampaignRole,
  invitePath,
  memberDisplayName,
  normalizeInviteToken,
  previewCampaignMemberInvite,
  type InvitePreviewStatus,
} from "@/lib/campaign-members"
import { campaignMemberDbErrorMessage, giveErrorCode, type DbErrorLike } from "@/lib/errors"
import { formatDateTime } from "@/lib/format"
import { isUuid } from "@/lib/ids"
import { dbAs } from "@/lib/supabase"
import { isSessionRejected } from "@/server/contributions"

import { acceptCampaignInvite } from "./actions"

export const metadata: Metadata = {
  title: "Lời mời đồng tổ chức",
  robots: { index: false, follow: false },
}

const UNAVAILABLE_COPY: Record<Exclude<InvitePreviewStatus, "pending">, { title: string; body: string }> = {
  accepted: {
    title: "Liên kết lời mời đã được sử dụng",
    body: "Mỗi liên kết lời mời chỉ dùng được một lần. Nếu bạn đã chấp nhận trước đó, hãy mở mục Chiến dịch của tôi.",
  },
  revoked: {
    title: "Lời mời đã bị thu hồi",
    body: "Người tổ chức chiến dịch đã thu hồi liên kết lời mời này. Hãy liên hệ họ nếu bạn cần một liên kết mới.",
  },
  expired: {
    title: "Lời mời đã hết hạn",
    body: "Liên kết lời mời này đã quá thời hạn sử dụng. Hãy nhờ người tổ chức tạo liên kết mới.",
  },
  unavailable: {
    title: "Chiến dịch không thể thêm đồng tổ chức",
    body: "Chiến dịch này đã bị hủy hoặc đang tạm dừng nên hiện không thể nhận thêm đồng tổ chức.",
  },
  invalid: {
    title: "Liên kết lời mời không hợp lệ",
    body: "Liên kết không tồn tại hoặc không đầy đủ. Hãy kiểm tra lại đường dẫn bạn nhận được.",
  },
}

function UnavailableState({ status }: { status: Exclude<InvitePreviewStatus, "pending"> }) {
  const copy = UNAVAILABLE_COPY[status]
  return (
    <EmptyState
      level={1}
      title={copy.title}
      icon={<UsersIcon width={40} height={40} />}
      action={
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
          <ButtonLink href="/" variant="secondary">
            Về trang chủ
          </ButtonLink>
          <ButtonLink href="/me/campaigns">Chiến dịch của tôi</ButtonLink>
        </div>
      }
    >
      {copy.body}
    </EmptyState>
  )
}

export default async function InviteAcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const normalizedToken = normalizeInviteToken((await params).token)
  if (!normalizedToken) {
    return <UnavailableState status="invalid" />
  }

  const returnPath = invitePath(normalizedToken)
  const loginHref = `/auth/login?return_path=${encodeURIComponent(returnPath)}`
  const session = await getSession()

  // Signed-out visitors never query private invite metadata (prevents draft title leaks).
  if (!session) {
    return (
      <EmptyState
        level={1}
        title="Lời mời tham gia đồng tổ chức"
        icon={<UsersIcon width={40} height={40} />}
        action={
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <ButtonLink href="/" variant="secondary" size="lg">
              Về trang chủ
            </ButtonLink>
            <a href={loginHref} className={buttonClass({ size: "lg" })}>
              Đăng nhập để xem lời mời
            </a>
          </div>
        }
      >
        Đăng nhập bằng tài khoản DOS ID của bạn để xem chi tiết lời mời và chấp nhận vai trò biên tập viên cho chiến
        dịch này. Liên kết lời mời chỉ dùng một lần và có thời hạn.
      </EmptyState>
    )
  }

  const db = dbAs(session.accessToken)
  let preview
  try {
    preview = await previewCampaignMemberInvite(db, normalizedToken)
  } catch (error) {
    const dbError = error as DbErrorLike | null
    if (isSessionRejected(error) || giveErrorCode(dbError) === "GIVE_AUTH_REQUIRED") redirect(loginHref)
    if (giveErrorCode(dbError) === "GIVE_RATE_LIMITED" || dbError?.code === "PT429") {
      return (
        <EmptyState
          level={1}
          title="Bạn thao tác quá nhanh"
          icon={<UsersIcon width={40} height={40} />}
          action={
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <ButtonLink href="/" variant="secondary">
                Về trang chủ
              </ButtonLink>
              <ButtonLink href="/me/campaigns">Chiến dịch của tôi</ButtonLink>
            </div>
          }
        >
          {campaignMemberDbErrorMessage(dbError)}
        </EmptyState>
      )
    }
    throw error
  }

  if (!preview || preview.status !== "pending") {
    const status: Exclude<InvitePreviewStatus, "pending"> =
      preview && preview.status in UNAVAILABLE_COPY
        ? (preview.status as Exclude<InvitePreviewStatus, "pending">)
        : "invalid"
    return <UnavailableState status={status} />
  }

  const campaignId = preview.campaign_id && isUuid(preview.campaign_id) ? preview.campaign_id : null
  const existingRole = campaignId ? await getMyCampaignRole(db, campaignId).catch(() => null) : null
  const organizerName = memberDisplayName(preview.organizer_display_name, "owner")
  const accountLabel = session.user.name?.trim() || session.user.email?.trim() || "Tài khoản DOS ID của bạn"

  return (
    <div className="container-page py-12 sm:py-16">
      <div className="max-w-160 space-y-6">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brand">Lời mời đồng tổ chức</Badge>
            <Badge tone="info">Biên tập viên</Badge>
          </div>
          <h1 className="text-h1-phone tracking-tight break-words sm:text-h1">
            {preview.campaign_title ?? "Chiến dịch trên Give"}
          </h1>
          <p className="text-fg">
            <span className="font-semibold">{organizerName}</span> mời bạn tham gia làm đồng tổ chức (biên tập viên) cho
            chiến dịch này.
          </p>
          {preview.expires_at && (
            <p className="text-sm text-muted tabular-nums">
              Liên kết chỉ dùng một lần, hết hạn lúc {formatDateTime(preview.expires_at)}.
            </p>
          )}
        </div>

        <Callout tone="info" title="Phạm vi quyền của đồng tổ chức">
          <p>
            Khi chấp nhận, bạn có thể sửa nội dung, ảnh bìa, video giới thiệu, các mốc mục tiêu, phần thưởng và đăng cập
            nhật theo trạng thái chiến dịch. Tên hiển thị của bạn sẽ xuất hiện trong mục Đội ngũ tổ chức khi chiến dịch
            công khai. Tài khoản nhận tiền, sao kê, giải trình khoản chi, hoàn tiền, giao quà và quản lý thành viên luôn
            chỉ thuộc về người tổ chức chính.
          </p>
        </Callout>

        {existingRole === "owner" && campaignId ? (
          <div className="space-y-4">
            <Callout tone="neutral">
              Bạn đang là người tổ chức chính của chiến dịch này. Liên kết lời mời chưa bị sử dụng và vẫn có thể gửi cho
              người khác.
            </Callout>
            <ButtonLink href={`/me/campaigns/${campaignId}`}>Mở trang quản lý chiến dịch</ButtonLink>
          </div>
        ) : existingRole === "editor" && campaignId ? (
          <div className="space-y-4">
            <Callout tone="neutral">
              Bạn đã là đồng tổ chức của chiến dịch này rồi. Liên kết lời mời chưa bị sử dụng.
            </Callout>
            <ButtonLink href={`/me/campaigns/${campaignId}`}>Mở trang chỉnh sửa chiến dịch</ButtonLink>
          </div>
        ) : (
          <div className="space-y-4 border-t border-border pt-6">
            <p className="text-sm text-muted">
              Bạn đang đăng nhập với tài khoản <span className="font-medium text-fg">{accountLabel}</span>.
            </p>
            <ActionForm action={acceptCampaignInvite.bind(null, normalizedToken)} className="space-y-4">
              <div className="flex flex-col gap-3 sm:flex-row">
                <SubmitButton className={buttonClass({ size: "lg" })}>Chấp nhận lời mời</SubmitButton>
                <ButtonLink href="/me/campaigns" variant="secondary" size="lg">
                  Bỏ qua
                </ButtonLink>
              </div>
            </ActionForm>
          </div>
        )}
      </div>
    </div>
  )
}
