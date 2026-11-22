import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { VerificationBadge } from "@/components/badges"
import { MyAmbassadorLinksSection } from "@/components/me/MyAmbassadorLinksSection"
import { ButtonLink } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import { PageHeader } from "@/components/ui/PageHeader"
import { listMyAmbassadorLinks, type MyAmbassadorLink } from "@/lib/ambassadors"
import { siteOrigin } from "@/lib/auth/origin"
import { requireSession } from "@/lib/auth/session"
import { getOrganizer, VERIFICATION_LABELS } from "@/lib/campaigns"
import { isNavigableOrganizerHandle, organizerProfileHref } from "@/lib/organizer-handle"
import { ORGANIZER_KIND_LABELS } from "@/lib/organizer-profile"
import { dbAs } from "@/lib/supabase"
import { isSessionRejected } from "@/server/contributions"

import { MePage } from "./_components/MePage"
import { updateOrganizerPublicProfile } from "./actions"
import { PublicProfileForm } from "./PublicProfileForm"

export const metadata: Metadata = { title: "Hồ sơ người tổ chức", robots: { index: false } }

export default async function MyProfilePage() {
  const session = await requireSession("/me")
  const db = dbAs(session.accessToken)

  let organizer
  let ambassadorLinks: MyAmbassadorLink[] = []
  try {
    ;[organizer, ambassadorLinks] = await Promise.all([
      getOrganizer(db, session.user.id),
      listMyAmbassadorLinks(db).catch((error: unknown) => {
        if (isSessionRejected(error)) throw error
        console.error("me: ambassador links lookup failed", error)
        return [] as MyAmbassadorLink[]
      }),
    ])
  } catch (error) {
    if (isSessionRejected(error)) redirect(`/auth/login?return_path=${encodeURIComponent("/me")}`)
    throw error
  }

  const origin = siteOrigin()

  if (!organizer) {
    return (
      <MePage section="profile">
        <PageHeader title="Hồ sơ người tổ chức">
          Thiết lập trang công khai để người ủng hộ tìm hiểu về bạn và các chiến dịch bạn tổ chức.
        </PageHeader>
        <EmptyState
          level={2}
          title="Bạn chưa có hồ sơ người tổ chức."
          action={<ButtonLink href="/start">Tạo hồ sơ người tổ chức</ButtonLink>}
        >
          Tạo hồ sơ người tổ chức trước khi bắt đầu gây quỹ và mở trang hồ sơ công khai trên Give.
        </EmptyState>
        <MyAmbassadorLinksSection links={ambassadorLinks} origin={origin} />
      </MePage>
    )
  }

  const publicHref = isNavigableOrganizerHandle(organizer.handle) ? organizerProfileHref(organizer.handle) : null

  return (
    <MePage section="profile">
      <PageHeader
        title="Hồ sơ người tổ chức"
        eyebrow={<VerificationBadge status={organizer.verification_status} />}
        actions={
          publicHref ? (
            <ButtonLink href={publicHref} variant="secondary">
              Xem trang công khai
            </ButtonLink>
          ) : undefined
        }
      >
        Đường dẫn hồ sơ và phần giới thiệu hiển thị công khai trên trang người tổ chức của bạn.
      </PageHeader>

      <section aria-labelledby="public-profile-heading" className="max-w-160">
        <h2 id="public-profile-heading" className="text-h2">
          Trang hồ sơ công khai
        </h2>
        <div className="mt-6">
          <PublicProfileForm
            initialHandle={organizer.handle ?? null}
            initialBio={organizer.bio ?? null}
            action={updateOrganizerPublicProfile}
          />
        </div>
      </section>

      <section aria-labelledby="identity-heading" className="max-w-160 border-t border-border pt-8">
        <h2 id="identity-heading" className="text-h2">
          Thông tin xác minh
        </h2>
        <dl className="mt-6 divide-y divide-border card">
          <div className="flex flex-col gap-1 p-4 sm:flex-row sm:justify-between sm:gap-6 sm:px-6">
            <dt className="shrink-0 text-sm text-muted">Tên hiển thị</dt>
            <dd className="min-w-0 font-semibold break-words text-fg sm:text-right">{organizer.display_name}</dd>
          </div>
          <div className="flex flex-col gap-1 p-4 sm:flex-row sm:justify-between sm:gap-6 sm:px-6">
            <dt className="shrink-0 text-sm text-muted">Tư cách gây quỹ</dt>
            <dd className="min-w-0 text-fg sm:text-right">{ORGANIZER_KIND_LABELS[organizer.kind]}</dd>
          </div>
          <div className="flex flex-col gap-1 p-4 sm:flex-row sm:justify-between sm:gap-6 sm:px-6">
            <dt className="shrink-0 text-sm text-muted">Trạng thái xác minh</dt>
            <dd className="min-w-0 text-fg sm:text-right">{VERIFICATION_LABELS[organizer.verification_status]}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-muted">
          Cần cập nhật tên hiển thị, tên pháp lý, tư cách hoặc số điện thoại?{" "}
          <Link href="/start" className="link">
            Chỉnh sửa tại Tạo chiến dịch
          </Link>
          .
        </p>
      </section>

      <MyAmbassadorLinksSection links={ambassadorLinks} origin={origin} />
    </MePage>
  )
}
