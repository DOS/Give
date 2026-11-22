import type { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"
import { cache } from "react"

import { VerificationBadge } from "@/components/badges"
import { CampaignCard } from "@/components/CampaignCard"
import { OrganizerAvatar } from "@/components/OrganizerAvatar"
import { Badge } from "@/components/ui/Badge"
import { ButtonLink } from "@/components/ui/Button"
import { EmptyState } from "@/components/ui/EmptyState"
import type { CardCampaign } from "@/lib/campaigns"
import { formatDate } from "@/lib/format"
import { organizerProfileHref } from "@/lib/organizer-handle"
import {
  getPublicOrganizerProfile,
  listOrganizerPublicCampaigns,
  ORGANIZER_KIND_LABELS,
  type PublicOrganizerProfile,
} from "@/lib/organizer-profile"
import { listMoneyTotals, raisedAmount, type MoneyTotals } from "@/lib/statement"
import { dbAs } from "@/lib/supabase"

const loadOrganizerProfile = cache(async (rawHandle: string): Promise<PublicOrganizerProfile | null> => {
  // Reject URLs containing leading/trailing or internal whitespace (e.g., %20).
  if (rawHandle !== rawHandle.trim() || /\s/.test(rawHandle)) return null
  return getPublicOrganizerProfile(dbAs(), rawHandle)
})

function metaDescription(profile: PublicOrganizerProfile): string {
  const bio = profile.bio?.trim().replace(/\s+/g, " ")
  if (bio) return bio.length > 160 ? `${bio.slice(0, 159).trimEnd()}…` : bio
  return `Các chiến dịch gây quỹ minh bạch của ${profile.display_name} trên Give.`
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const profile = await loadOrganizerProfile((await params).handle)
  if (!profile) {
    return {
      title: "Không tìm thấy",
      robots: { index: false, follow: false },
    }
  }
  const description = metaDescription(profile)
  const canonicalPath = organizerProfileHref(profile.handle)
  return {
    title: profile.display_name,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      type: "profile",
      siteName: "Give",
      locale: "vi_VN",
      title: profile.display_name,
      description,
      url: canonicalPath,
      ...(profile.avatar_url ? { images: [profile.avatar_url] } : {}),
    },
  }
}

function CampaignGrid({
  id,
  heading,
  campaigns,
  totals,
  prioritizeFirstThree,
}: {
  id: string
  heading: string
  campaigns: readonly CardCampaign[]
  totals: ReadonlyMap<string, MoneyTotals>
  prioritizeFirstThree?: boolean
}) {
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-h2">
        {heading} <span className="font-normal text-muted">({campaigns.length})</span>
      </h2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
        {campaigns.map((campaign, index) => {
          const t = totals.get(campaign.id)
          return (
            <div key={campaign.id} className="min-w-0">
              <CampaignCard
                campaign={{ ...campaign, organizer: null }}
                raised={raisedAmount(t, campaign.type)}
                people={t ? (campaign.type === "give" ? t.supporters_count : t.backers_count) : undefined}
                priority={prioritizeFirstThree && index < 3}
                headingLevel={3}
              />
            </div>
          )
        })}
      </div>
    </section>
  )
}

/**
 * Public organizer profile page (/u/[handle], DOS/Give#251).
 *
 * Reads only through `give.public_organizer_profile` and
 * `give.list_organizer_public_campaigns` on the anonymous client (`dbAs()`),
 * plus ledger totals from `give.public_campaigns`. Never exposes legal name,
 * phone, email, user_id, or receiving accounts.
 */
export default async function OrganizerProfilePage({ params }: { params: Promise<{ handle: string }> }) {
  const rawHandle = (await params).handle
  const profile = await loadOrganizerProfile(rawHandle)
  if (!profile) notFound()
  if (rawHandle !== profile.handle) permanentRedirect(organizerProfileHref(profile.handle))

  const db = dbAs()
  const campaigns = await listOrganizerPublicCampaigns(db, profile.handle)
  const totals =
    campaigns.length > 0
      ? await listMoneyTotals(
          db,
          campaigns.map((c) => c.id)
        )
      : new Map<string, MoneyTotals>()

  const liveCampaigns = campaigns.filter((c) => c.status === "live")
  const pastCampaigns = campaigns.filter((c) => c.status !== "live")
  const bio = profile.bio?.trim() || null

  return (
    <div className="container-page pt-8 pb-16 sm:pt-12 lg:pb-24">
      <header className="flex items-start gap-4 sm:gap-6">
        <OrganizerAvatar displayName={profile.display_name} avatarUrl={profile.avatar_url} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <VerificationBadge status={profile.verification_status} />
            <Badge tone="neutral">{ORGANIZER_KIND_LABELS[profile.kind]}</Badge>
          </div>
          <h1 className="mt-2 text-h1-phone tracking-tight break-words sm:text-h1">{profile.display_name}</h1>
          <p className="mt-2 text-sm break-words text-muted">
            @{profile.handle} · Tham gia từ {formatDate(profile.created_at)}
          </p>
          {bio && <p className="mt-4 max-w-[68ch] break-words whitespace-pre-line text-fg">{bio}</p>}
        </div>
      </header>

      {campaigns.length === 0 ? (
        <section className="mt-16 lg:mt-24" aria-label="Chiến dịch công khai">
          <EmptyState
            level={2}
            title="Chưa có chiến dịch công khai nào."
            action={
              <ButtonLink href="/campaigns" variant="secondary">
                Khám phá chiến dịch
              </ButtonLink>
            }
          >
            Các chiến dịch đã được duyệt của {profile.display_name} sẽ hiển thị tại đây.
          </EmptyState>
        </section>
      ) : (
        <div className="mt-16 space-y-16 lg:mt-24 lg:space-y-24">
          {liveCampaigns.length > 0 && (
            <CampaignGrid
              id="live-campaigns"
              heading="Đang gây quỹ"
              campaigns={liveCampaigns}
              totals={totals}
              prioritizeFirstThree
            />
          )}
          {pastCampaigns.length > 0 && (
            <CampaignGrid
              id="past-campaigns"
              heading="Đã kết thúc"
              campaigns={pastCampaigns}
              totals={totals}
              prioritizeFirstThree={liveCampaigns.length === 0}
            />
          )}
        </div>
      )}
    </div>
  )
}
