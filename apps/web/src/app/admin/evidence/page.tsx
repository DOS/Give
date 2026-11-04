import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ActionForm, SubmitButton } from "@/components/forms"
import { EmptyState } from "@/components/ui/EmptyState"
import { Field } from "@/components/ui/Field"
import { Notice } from "@/components/ui/Notice"
import { requireSession } from "@/lib/auth/session"
import { isStaff } from "@/lib/campaigns"
import { HIDDEN_LIMIT, listModerationQueue, MODERATION_ROLES, type ModerationItem } from "@/lib/evidence-moderation"
import { formatDateTime } from "@/lib/format"
import { campaignRefs } from "@/lib/receiving-accounts"
import { EVIDENCE_KINDS, evidenceUrl } from "@/lib/statement"
import { dbAs } from "@/lib/supabase"

import { AdminPage, AdminSection, ItemList } from "../_components/ui"
import { moderateEvidence } from "./actions"

export const metadata: Metadata = { title: "Ảnh chứng từ bị báo cáo", robots: { index: false } }

/**
 * Moderator queue for public disbursement evidence (owner decision on
 * DOS/Give#58): images people reported as exposing personal data, and the
 * images currently hidden. Images load through /media/evidence under RLS,
 * which lets moderators see reported and hidden ones.
 */
export default async function AdminEvidencePage() {
  const session = await requireSession("/admin/evidence")
  const db = dbAs(session.accessToken)
  // Moderator and admin staff only; others get a 404.
  if (!(await isStaff(db, MODERATION_ROLES))) notFound()

  const { reported, hidden } = await listModerationQueue(db)
  const refs = await campaignRefs(
    db,
    [...reported, ...hidden].flatMap((item) => (item.campaign_id ? [item.campaign_id] : []))
  )

  return (
    <AdminPage
      title="Ảnh chứng từ bị báo cáo"
      intro={
        <p>
          Ảnh chứng từ khoản chi được công khai trên sao kê. Người tổ chức phải che thông tin cá nhân của người nhận (số
          CCCD, số điện thoại, địa chỉ…). Ẩn ảnh nào lộ thông tin cá nhân: ảnh biến khỏi sao kê công khai ngay, người tổ
          chức vẫn thấy ảnh đã bị ẩn để tải lại bản đã che. Giữ ảnh nếu báo cáo không đúng. Mỗi lần ẩn hoặc hiện lại
          được ghi vào nhật ký kiểm toán.
        </p>
      }
    >
      <AdminSection id="reported" title="Chờ xem xét" count={reported.length}>
        {reported.length === 0 ? (
          <EmptyState title="Không có ảnh nào bị báo cáo.">
            Ảnh chứng từ bị người xem báo cáo lộ thông tin cá nhân sẽ hiện ở đây.
          </EmptyState>
        ) : (
          <ItemList>
            {reported.map((item) => (
              <EvidenceCard key={item.evidence_id} item={item} campaign={refs.get(item.campaign_id ?? "")} />
            ))}
          </ItemList>
        )}
      </AdminSection>

      <AdminSection
        id="hidden"
        title="Đang ẩn"
        count={hidden.length < HIDDEN_LIMIT ? hidden.length : `${HIDDEN_LIMIT} gần nhất`}
      >
        {hidden.length === 0 ? (
          <EmptyState title="Không có ảnh nào đang bị ẩn." />
        ) : (
          <ItemList>
            {hidden.map((item) => (
              <EvidenceCard key={item.evidence_id} item={item} campaign={refs.get(item.campaign_id ?? "")} />
            ))}
          </ItemList>
        )}
      </AdminSection>
    </AdminPage>
  )
}

function EvidenceCard({
  item,
  campaign,
}: {
  item: ModerationItem
  campaign: { slug: string; title: string } | undefined
}) {
  const isHidden = item.state?.hidden ?? false
  const kind = EVIDENCE_KINDS[item.kind] ?? item.kind
  return (
    <li className="flex flex-col gap-6 card p-5 sm:flex-row sm:p-6">
      <a
        href={evidenceUrl(item.storage_path)}
        target="_blank"
        rel="noreferrer"
        className="shrink-0 self-start rounded"
        aria-label={`${kind}: mở ảnh cỡ đầy đủ trong thẻ mới`}
      >
        <Image
          src={evidenceUrl(item.storage_path)}
          alt={kind}
          width={192}
          height={192}
          unoptimized
          className="h-48 w-48 rounded border border-line bg-surface object-contain"
        />
      </a>
      <div className="min-w-0 flex-1 space-y-4">
        <p className="text-sm text-muted">
          {kind} · tải lên {formatDateTime(item.uploaded_at)}
          {campaign && (
            <>
              {" · "}
              <Link href={`/campaigns/${campaign.slug}/statement`} className="link" target="_blank">
                {campaign.title}
                <span className="sr-only"> (mở thẻ mới)</span>
              </Link>
            </>
          )}
        </p>
        {isHidden && (
          <Notice tone="danger">
            Đang ẩn từ {formatDateTime(item.state!.moderated_at)}
            {item.state?.reason ? `: ${item.state.reason}` : ""}
          </Notice>
        )}
        {item.reports.length > 0 && (
          <div>
            <p className="font-semibold text-ink">{item.reports.length} báo cáo đang mở</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-body">
              {item.reports.map((r) => (
                <li key={r.id} className="break-words">
                  {r.reason ?? <span className="text-muted">(không ghi lý do)</span>}{" "}
                  <span className="text-sm text-muted">{formatDateTime(r.created_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <ActionForm action={moderateEvidence.bind(null, item.evidence_id)} className="max-w-xl space-y-3">
          <Field htmlFor={`reason-${item.evidence_id}`} label="Lý do (bắt buộc khi ẩn)">
            <input id={`reason-${item.evidence_id}`} name="reason" maxLength={500} className="field" />
          </Field>
          <div className="flex flex-wrap gap-2">
            {!isHidden && (
              <SubmitButton name="decision" value="hide" className="btn-primary">
                Ẩn ảnh
              </SubmitButton>
            )}
            <SubmitButton name="decision" value="show" className="btn-secondary">
              {isHidden ? "Hiện lại ảnh" : "Giữ ảnh"}
            </SubmitButton>
          </div>
        </ActionForm>
      </div>
    </li>
  )
}
