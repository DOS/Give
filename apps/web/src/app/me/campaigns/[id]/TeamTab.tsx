import { MemberAvatar } from "@/components/campaign/MemberAvatar"
import { ActionForm, SubmitButton } from "@/components/forms"
import { Badge, type BadgeTone } from "@/components/ui/Badge"
import { buttonClass } from "@/components/ui/Button"
import { Callout } from "@/components/ui/Callout"
import { EmptyState } from "@/components/ui/EmptyState"
import { UsersIcon } from "@/components/ui/icons"
import {
  INVITE_STATUS_LABELS,
  isInvitableStatus,
  MAX_CAMPAIGN_INVITES,
  MAX_CAMPAIGN_MEMBERS,
  memberDisplayName,
  type CampaignInviteStatus,
  type CampaignMemberInviteRow,
  type CampaignMemberRow,
} from "@/lib/campaign-members"
import type { CampaignStatus } from "@/lib/campaigns"
import { formatDateTime } from "@/lib/format"

import { Panel } from "../../_components/Panel"
import { createCampaignInvite, removeCampaignMember, revokeCampaignInvite } from "../member-actions"

import { CreateInviteForm } from "./CreateInviteForm"

const INVITE_STATUS_TONES: Record<CampaignInviteStatus, BadgeTone> = {
  pending: "warning",
  accepted: "brand",
  revoked: "neutral",
  expired: "neutral",
}

/**
 * Owner-only co-organizer management tab on `/me/campaigns/[id]?tab=team`
 * (DOS/Give#253).
 *
 * Lists active editors, generates single-use expiring invite links (raw token
 * shown once right after creation), revokes pending invites, and removes
 * editors immediately.
 */
export function TeamTab({
  campaignId,
  campaignSlug,
  campaignStatus,
  members,
  invites,
  membersError,
  invitesError,
  origin,
}: {
  campaignId: string
  campaignSlug: string
  campaignStatus: CampaignStatus
  members: readonly CampaignMemberRow[]
  invites: readonly CampaignMemberInviteRow[]
  membersError: string | null
  invitesError: string | null
  origin?: string
}) {
  const invitable = isInvitableStatus(campaignStatus)
  const pendingInvites = invites.filter((invite) => invite.status === "pending")
  const memberLimitReached = members.length >= MAX_CAMPAIGN_MEMBERS
  const inviteLimitReached = pendingInvites.length >= MAX_CAMPAIGN_INVITES

  return (
    <div className="lg:grid lg:grid-cols-12 lg:gap-x-6">
      <div className="min-w-0 space-y-12 lg:col-span-8">
        <Callout tone="info" title="Tiền và quyền quyết định luôn thuộc về bạn">
          <p>
            Đồng tổ chức (biên tập viên) chỉ được sửa nội dung, ảnh bìa, video giới thiệu, các mốc mục tiêu, phần thưởng
            và đăng cập nhật theo trạng thái chiến dịch. Tài khoản nhận tiền, sao kê, giải trình khoản chi, hoàn tiền,
            giao quà, gửi duyệt, hủy chiến dịch và quản lý đội ngũ luôn chỉ thuộc về người tổ chức chính.
          </p>
        </Callout>

        <Panel
          id="team-members"
          title="Đội ngũ hiện tại"
          description={
            <p className="tabular-nums">
              {members.length} / {MAX_CAMPAIGN_MEMBERS} đồng tổ chức đang hoạt động.
            </p>
          }
        >
          {membersError ? (
            <Callout tone="danger">{membersError}</Callout>
          ) : members.length === 0 ? (
            <EmptyState title="Chưa có đồng tổ chức nào." icon={<UsersIcon width={40} height={40} />}>
              {invitable
                ? "Tạo liên kết mời bên dưới để thêm biên tập viên hỗ trợ cập nhật chiến dịch."
                : "Chiến dịch này hiện không có đồng tổ chức nào."}
            </EmptyState>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {members.map((member) => {
                const name = memberDisplayName(member.display_name, "editor")
                return (
                  <li
                    key={member.user_id}
                    className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <MemberAvatar displayName={member.display_name} avatarUrl={member.avatar_url} role="editor" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold break-words text-fg">{name}</span>
                          <Badge tone="info">Biên tập viên</Badge>
                        </div>
                        <p className="mt-0.5 text-sm text-muted tabular-nums">
                          Tham gia lúc {formatDateTime(member.accepted_at)}
                        </p>
                      </div>
                    </div>
                    <ActionForm
                      action={removeCampaignMember.bind(null, campaignId, member.user_id, campaignSlug)}
                      confirm={`Gỡ “${name}” khỏi đội ngũ? Quyền chỉnh sửa của họ sẽ bị thu hồi ngay lập tức.`}
                    >
                      <SubmitButton className={buttonClass({ variant: "danger", size: "sm" })}>
                        Gỡ khỏi đội ngũ<span className="sr-only">: {name}</span>
                      </SubmitButton>
                    </ActionForm>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        <Panel
          id="invite-member"
          title="Mời đồng tổ chức"
          description="Mỗi liên kết mời chỉ dùng được một lần và tự hết hạn. Người nhận cần đăng nhập DOS ID để chấp nhận lời mời."
        >
          {!invitable ? (
            <Callout tone="neutral">Không thể tạo lời mời mới khi chiến dịch đã hủy hoặc đang tạm dừng.</Callout>
          ) : memberLimitReached ? (
            <Callout tone="warning">
              Chiến dịch đã đạt giới hạn tối đa {MAX_CAMPAIGN_MEMBERS} đồng tổ chức. Hãy gỡ bớt thành viên trước khi mời
              thêm.
            </Callout>
          ) : inviteLimitReached ? (
            <Callout tone="warning">
              Chiến dịch đang có {MAX_CAMPAIGN_INVITES} lời mời chờ chấp nhận. Hãy thu hồi bớt lời mời chưa dùng trước
              khi tạo liên kết mới.
            </Callout>
          ) : (
            <CreateInviteForm action={createCampaignInvite.bind(null, campaignId)} origin={origin} />
          )}
        </Panel>

        <Panel
          id="team-invites"
          title="Lời mời đã tạo"
          description={
            <p className="tabular-nums">
              {pendingInvites.length} / {MAX_CAMPAIGN_INVITES} lời mời đang chờ. Liên kết chỉ hiện một lần lúc tạo và
              không thể xem lại vì lý do bảo mật.
            </p>
          }
        >
          {invitesError ? (
            <Callout tone="danger">{invitesError}</Callout>
          ) : invites.length === 0 ? (
            <p className="text-muted">Chưa có lời mời nào được tạo.</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {invites.map((invite) => {
                const isPending = invite.status === "pending"
                const acceptedName = invite.accepted_by
                  ? memberDisplayName(invite.accepted_by_display_name, "editor")
                  : null
                return (
                  <li
                    key={invite.invite_id}
                    className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={INVITE_STATUS_TONES[invite.status]}>{INVITE_STATUS_LABELS[invite.status]}</Badge>
                        <span className="text-sm text-muted tabular-nums">
                          Tạo lúc {formatDateTime(invite.created_at)}
                        </span>
                      </div>
                      {invite.note && <p className="max-w-[68ch] break-words text-fg">{invite.note}</p>}
                      <p className="text-sm text-muted tabular-nums">
                        {invite.status === "accepted" && invite.accepted_at ? (
                          <>
                            {acceptedName ? `${acceptedName} đã chấp nhận` : "Đã chấp nhận"} lúc{" "}
                            {formatDateTime(invite.accepted_at)}
                          </>
                        ) : invite.status === "revoked" && invite.revoked_at ? (
                          <>Đã thu hồi lúc {formatDateTime(invite.revoked_at)}</>
                        ) : (
                          <>
                            {invite.status === "expired" ? "Đã hết hạn lúc " : "Hết hạn lúc "}
                            {formatDateTime(invite.expires_at)}
                          </>
                        )}
                      </p>
                    </div>
                    {isPending && (
                      <ActionForm
                        action={revokeCampaignInvite.bind(null, campaignId, invite.invite_id)}
                        confirm="Thu hồi liên kết mời này? Người nhận sẽ không thể dùng liên kết này nữa."
                      >
                        <SubmitButton className={buttonClass({ variant: "secondary", size: "sm" })}>
                          Thu hồi<span className="sr-only"> lời mời tạo lúc {formatDateTime(invite.created_at)}</span>
                        </SubmitButton>
                      </ActionForm>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  )
}
