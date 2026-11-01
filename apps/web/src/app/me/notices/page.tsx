import type { Metadata } from "next"
import Link from "next/link"

import { ActionForm, SubmitButton } from "@/components/forms"
import { requireSession } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { describeNotice, listNotices } from "@/lib/notices"
import { dbAs } from "@/lib/supabase"

import { markAllNoticesRead, markNoticeRead } from "./actions"

export const metadata: Metadata = { title: "Thông báo", robots: { index: false } }

/** The signed-in user's notices, read with their own token under RLS. */
export default async function MyNoticesPage() {
  const session = await requireSession("/me/notices")
  const notices = await listNotices(dbAs(session.accessToken), session.user.id)
  const unread = notices.filter((n) => !n.read_at).length

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold">Thông báo</h1>
        {unread > 0 && (
          <ActionForm action={markAllNoticesRead}>
            <SubmitButton className="btn-secondary">Đánh dấu tất cả đã đọc</SubmitButton>
          </ActionForm>
        )}
      </div>
      <p className="mt-2 text-sm text-gray-600">
        {unread > 0 ? `Bạn có ${unread} thông báo chưa đọc.` : "Bạn đã đọc hết thông báo."}
      </p>

      {notices.length === 0 ? (
        <div className="mt-8 card p-10 text-center text-gray-600">Chưa có thông báo nào.</div>
      ) : (
        <ul className="mt-8 divide-y divide-gray-200 rounded-lg border border-gray-200">
          {notices.map((notice) => {
            const view = describeNotice(notice)
            return (
              <li
                key={notice.id}
                className={`flex flex-wrap items-start gap-4 p-4 ${notice.read_at ? "" : "bg-brand-50"}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {!notice.read_at && (
                      <span className="inline-flex rounded-full bg-brand-600 px-2 py-0.5 text-xs font-medium text-white">
                        Mới
                      </span>
                    )}
                    <h2 className="font-semibold">{view.title}</h2>
                  </div>
                  <p className="mt-1 text-sm text-gray-700">{view.body}</p>
                  <p className="mt-1 text-xs text-gray-500">{formatDateTime(notice.created_at)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {view.href && view.linkLabel && (
                    <Link href={view.href} className="btn-secondary">
                      {view.linkLabel}
                    </Link>
                  )}
                  {!notice.read_at && (
                    <ActionForm action={markNoticeRead.bind(null, notice.id)}>
                      <SubmitButton className="text-sm text-gray-600 hover:text-gray-900">Đã đọc</SubmitButton>
                    </ActionForm>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
