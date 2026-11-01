import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"

import { ActionForm, SubmitButton } from "@/components/forms"
import { requireSession } from "@/lib/auth/session"
import { isStaff } from "@/lib/campaigns"
import { HIDDEN_LIMIT, listModerationQueue, MODERATION_ROLES, type ModerationItem } from "@/lib/evidence-moderation"
import { formatDateTime } from "@/lib/format"
import { campaignRefs } from "@/lib/receiving-accounts"
import { EVIDENCE_KINDS, evidenceUrl } from "@/lib/statement"
import { dbAs } from "@/lib/supabase"

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
    <div className="mx-auto max-w-5xl space-y-12 px-4 py-10">
      <div>
        <Link href="/admin" className="text-sm text-gray-600 hover:text-gray-900">
          ← Kiểm duyệt
        </Link>
        <h1 className="mt-2 text-3xl font-bold">Ảnh chứng từ bị báo cáo</h1>
        <p className="mt-2 text-sm text-gray-600">
          Ảnh chứng từ khoản chi được công khai trên sao kê. Người tổ chức phải che thông tin cá nhân của người nhận (số
          CCCD, số điện thoại, địa chỉ…). Ẩn ảnh nào lộ thông tin cá nhân: ảnh biến khỏi sao kê công khai ngay, người tổ
          chức vẫn thấy ảnh đã bị ẩn để tải lại bản đã che. Giữ ảnh nếu báo cáo không đúng. Mỗi lần ẩn hoặc hiện lại
          được ghi vào nhật ký kiểm toán.
        </p>
      </div>

      <section>
        <h2 className="mb-4 text-xl font-bold">Chờ xem xét ({reported.length})</h2>
        {reported.length === 0 ? (
          <p className="card p-6 text-gray-600">Không có ảnh nào bị báo cáo.</p>
        ) : (
          <ul className="space-y-4">
            {reported.map((item) => (
              <EvidenceCard key={item.evidence_id} item={item} campaign={refs.get(item.campaign_id ?? "")} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-bold">
          Đang ẩn{hidden.length < HIDDEN_LIMIT ? ` (${hidden.length})` : ` (${HIDDEN_LIMIT} gần nhất)`}
        </h2>
        {hidden.length === 0 ? (
          <p className="card p-6 text-gray-600">Không có ảnh nào đang bị ẩn.</p>
        ) : (
          <ul className="space-y-4">
            {hidden.map((item) => (
              <EvidenceCard key={item.evidence_id} item={item} campaign={refs.get(item.campaign_id ?? "")} />
            ))}
          </ul>
        )}
      </section>
    </div>
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
    <li className="flex flex-wrap gap-6 card p-6">
      <a href={evidenceUrl(item.storage_path)} target="_blank" rel="noreferrer" className="shrink-0">
        <Image
          src={evidenceUrl(item.storage_path)}
          alt={kind}
          width={192}
          height={192}
          unoptimized
          className="h-48 w-48 rounded border border-gray-200 bg-gray-50 object-contain"
        />
      </a>
      <div className="min-w-0 flex-1 space-y-3 text-sm">
        <p className="text-gray-600">
          {kind} · tải lên {formatDateTime(item.uploaded_at)}
          {campaign && (
            <>
              {" · "}
              <Link href={`/campaigns/${campaign.slug}/statement`} className="text-brand-600" target="_blank">
                {campaign.title}
              </Link>
            </>
          )}
        </p>
        {isHidden && (
          <p className="rounded bg-red-50 p-2 text-red-800">
            Đang ẩn từ {formatDateTime(item.state!.moderated_at)}
            {item.state?.reason ? `: ${item.state.reason}` : ""}
          </p>
        )}
        {item.reports.length > 0 && (
          <div>
            <p className="font-medium">{item.reports.length} báo cáo đang mở</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-gray-700">
              {item.reports.map((r) => (
                <li key={r.id} className="break-words">
                  {r.reason ?? <span className="text-gray-500">(không ghi lý do)</span>}{" "}
                  <span className="text-xs text-gray-500">{formatDateTime(r.created_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <ActionForm action={moderateEvidence.bind(null, item.evidence_id)} className="space-y-2">
          <label htmlFor={`reason-${item.evidence_id}`} className="label">
            Lý do (bắt buộc khi ẩn)
          </label>
          <input id={`reason-${item.evidence_id}`} name="reason" maxLength={500} className="field" />
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
