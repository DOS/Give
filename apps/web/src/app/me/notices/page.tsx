import type { Metadata } from "next"
import { Suspense } from "react"

import { ActionForm, SubmitButton } from "@/components/forms"
import { Badge } from "@/components/ui/Badge"
import { buttonClass, ButtonLink } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { SkeletonList } from "@/components/ui/Skeleton"
import { requireSession, type Session } from "@/lib/auth/session"
import { formatDateTime } from "@/lib/format"
import { countUnreadNotices, describeNotice, listNotices, NOTICE_PAGE_SIZE } from "@/lib/notices"
import { dbAs } from "@/lib/supabase"

import { MePage } from "../_components/MePage"

import { markAllNoticesRead, markNoticeRead } from "./actions"

export const metadata: Metadata = { title: "Thông báo", robots: { index: false } }

export default async function MyNoticesPage() {
  const session = await requireSession("/me/notices")

  return (
    <MePage section="notices">
      <Suspense
        fallback={
          <>
            <PageHeader title="Thông báo" />
            <SkeletonList label="Đang tải thông báo…" />
          </>
        }
      >
        <NoticeList session={session} />
      </Suspense>
    </MePage>
  )
}

/** The signed-in user's notices, read with their own token under RLS. */
async function NoticeList({ session }: { session: Session }) {
  const db = dbAs(session.accessToken)
  // The unread count covers every notice, like the header badge, not only
  // the newest page: "mark all" must stay reachable while any is unread.
  const [notices, unreadCount] = await Promise.all([
    listNotices(db, session.user.id),
    countUnreadNotices(db, session.user.id),
  ])
  // The count is 0 on an error; never show fewer than the list itself holds.
  const unread = Math.max(unreadCount, notices.filter((n) => !n.read_at).length)

  return (
    <>
      <PageHeader
        title="Thông báo"
        actions={
          unread > 0 &&
          notices.length > 0 && (
            <ActionForm action={markAllNoticesRead}>
              {/* Only what this page showed: a notice that arrives later stays unread. */}
              <input type="hidden" name="before" value={notices[0].created_at} />
              <SubmitButton className={buttonClass({ variant: "secondary" })}>Đánh dấu tất cả đã đọc</SubmitButton>
            </ActionForm>
          )
        }
      >
        {unread > 0 ? `Bạn có ${unread} thông báo chưa đọc.` : "Bạn đã đọc hết thông báo."}
        {notices.length >= NOTICE_PAGE_SIZE && ` Trang này hiện ${NOTICE_PAGE_SIZE} thông báo mới nhất.`}
      </PageHeader>

      {notices.length === 0 ? (
        <EmptyState title="Chưa có thông báo nào.">
          Give báo cho bạn ở đây khi tiền ủng hộ về, khi chiến dịch được duyệt và khi có việc cần bạn làm.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line card">
          {notices.map((notice) => {
            const view = describeNotice(notice)
            return (
              <li
                key={notice.id}
                className={`flex flex-col gap-3 border-l-4 p-4 sm:flex-row sm:items-start sm:gap-6 sm:p-5 ${
                  notice.read_at ? "border-l-transparent" : "border-l-brand-600 bg-brand-50/60"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {!notice.read_at && <Badge tone="brand">Mới</Badge>}
                    <h2 className="text-lg leading-snug font-semibold break-words">{view.title}</h2>
                  </div>
                  <p className="mt-1 break-words text-body">{view.body}</p>
                  <p className="mt-1 text-sm text-muted">{formatDateTime(notice.created_at)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                  {view.href && view.linkLabel && (
                    <ButtonLink href={view.href} variant="secondary">
                      {view.linkLabel}
                    </ButtonLink>
                  )}
                  {!notice.read_at && (
                    <ActionForm action={markNoticeRead.bind(null, notice.id)}>
                      <SubmitButton className={buttonClass({ variant: "ghost" })}>Đã đọc</SubmitButton>
                    </ActionForm>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
