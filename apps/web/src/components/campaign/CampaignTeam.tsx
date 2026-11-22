import { Badge } from "@/components/ui/Badge"
import { CheckIcon } from "@/components/ui/icons"
import { memberDisplayName, type PublicTeamMember } from "@/lib/campaign-members"
import { VERIFICATION_LABELS } from "@/lib/campaigns"

import { MemberAvatar } from "./MemberAvatar"

/**
 * Public campaign team block on `/campaigns/[slug]` (DOS/Give#253).
 *
 * Renders only when the campaign has at least one accepted co-organizer
 * (`member_role === "editor"`), keeping solo campaigns uncluttered since the
 * owner is already shown in the campaign header. Rows arrive from
 * `give.campaign_public_team` (owner first, then editors by `joined_at ASC`,
 * zero PII, deleted/inactive accounts already neutralized).
 */
export function CampaignTeam({ members }: { members: readonly PublicTeamMember[] }) {
  const hasEditors = members.some((m) => m.member_role === "editor")
  if (!hasEditors) return null

  return (
    <section id="doi-ngu" aria-labelledby="team-heading" className="scroll-mt-24">
      <h2 id="team-heading" className="text-h2">
        Đội ngũ tổ chức
      </h2>
      <p className="mt-2 max-w-[68ch] text-sm text-muted">
        Đồng tổ chức hỗ trợ cập nhật nội dung chiến dịch. Tiền ủng hộ luôn chuyển thẳng vào tài khoản nhận của người tổ
        chức chính.
      </p>
      <ul className="mt-6 divide-y divide-border rounded-md border border-border">
        {members.map((member, index) => {
          const isOwner = member.member_role === "owner"
          const name = memberDisplayName(member.display_name, member.member_role)
          return (
            <li
              key={`${member.member_role}-${member.joined_at ?? index}-${index}`}
              className="flex items-center gap-3 p-4"
            >
              <MemberAvatar displayName={member.display_name} avatarUrl={member.avatar_url} role={member.member_role} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold break-words text-fg">{name}</span>
                  {isOwner && member.verification_status === "verified" && (
                    <CheckIcon
                      width={16}
                      height={16}
                      className="shrink-0 text-primary"
                      role="img"
                      aria-hidden={false}
                      aria-label="Đã xác minh"
                    />
                  )}
                  <Badge tone={isOwner ? "brand" : "info"}>{isOwner ? "Người tổ chức chính" : "Đồng tổ chức"}</Badge>
                </div>
                {isOwner && member.verification_status && (
                  <p className="mt-0.5 text-sm text-muted">
                    {member.kind === "organization" ? "Tổ chức gây quỹ" : "Người gây quỹ"} ·{" "}
                    {VERIFICATION_LABELS[member.verification_status]}
                  </p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
