import type { MetadataRoute } from "next"

import { siteOrigin } from "@/lib/auth/origin"
import {
  isPublicCampaignVisible,
  isPublicStatus,
  listCampaignOrganizers,
  PUBLIC_STATUSES,
  type CampaignStatus,
  type Db,
} from "@/lib/campaigns"
import { isNavigableOrganizerHandle } from "@/lib/organizer-handle"
import { SLUG_PATTERN } from "@/lib/slug"
import { dbAs } from "@/lib/supabase"

export const dynamic = "force-dynamic"

/** PostgREST returns at most this many rows per request on Supabase. */
const SITEMAP_PAGE_SIZE = 1000
const SITEMAP_CAMPAIGN_LIMIT = 5000

interface SitemapCampaignRow {
  id: string
  slug: string
  status: CampaignStatus
  prelaunch_public: boolean | null
  starts_at: string | null
  created_at: string
  updated_at: string
}

function parseValidDate(value: string | null | undefined): Date | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

async function listSitemapCampaigns(db: Db): Promise<SitemapCampaignRow[]> {
  const rows: SitemapCampaignRow[] = []
  for (let from = 0; from < SITEMAP_CAMPAIGN_LIMIT; from += SITEMAP_PAGE_SIZE) {
    const to = Math.min(from + SITEMAP_PAGE_SIZE, SITEMAP_CAMPAIGN_LIMIT) - 1
    const { data, error } = await db
      .from("campaigns")
      .select("id, slug, status, prelaunch_public, starts_at, created_at, updated_at")
      .in("status", [...PUBLIC_STATUSES, "approved"])
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, to)

    if (error) throw error
    const page = (data ?? []) as SitemapCampaignRow[]
    rows.push(...page)
    if (page.length < SITEMAP_PAGE_SIZE) break
  }
  return rows
}

/**
 * Dynamic sitemap.xml for public Give campaigns, statements, and organizer profiles.
 *
 * Security invariants:
 * - Anonymous `dbAs()` only (never `dbService()`).
 * - Filters publicly visible campaigns via RLS (`campaigns_read`) and double-checks
 *   in TypeScript with `isPublicCampaignVisible`.
 * - Emits `/statement` only for `isPublicStatus` (never pre-launch teasers).
 * - Derives unique organizer handles only through chunked `public_campaign_organizers`
 *   RPC calls (never reading `give.organizers` directly) and `isNavigableOrganizerHandle`.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = siteOrigin()
  if (!origin) return []

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: `${origin}/`,
      changeFrequency: "hourly",
      priority: 1,
    },
    {
      url: `${origin}/campaigns`,
      changeFrequency: "hourly",
      priority: 0.9,
    },
  ]

  try {
    const db = dbAs()
    const rows = await listSitemapCampaigns(db)

    const now = new Date()
    const seenSlugs = new Set<string>()
    const visibleCampaigns: SitemapCampaignRow[] = []
    for (const row of rows) {
      if (
        typeof row.id !== "string" ||
        !row.id ||
        typeof row.slug !== "string" ||
        row.slug.length === 0 ||
        row.slug.length > 80 ||
        !SLUG_PATTERN.test(row.slug)
      ) {
        continue
      }
      if (!isPublicCampaignVisible(row, now)) continue
      if (seenSlugs.has(row.slug)) continue
      seenSlugs.add(row.slug)
      visibleCampaigns.push(row)
    }

    if (visibleCampaigns.length === 0) return staticEntries

    const organizers = await listCampaignOrganizers(
      db,
      visibleCampaigns.map((c) => c.id)
    )

    const campaignEntries: MetadataRoute.Sitemap = []
    const statementEntries: MetadataRoute.Sitemap = []
    const organizerLastModified = new Map<string, Date | undefined>()

    for (const campaign of visibleCampaigns) {
      const lastModified = parseValidDate(campaign.updated_at) ?? parseValidDate(campaign.created_at)
      const encodedSlug = encodeURIComponent(campaign.slug)

      campaignEntries.push({
        url: `${origin}/campaigns/${encodedSlug}`,
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: campaign.status === "live" ? "hourly" : "daily",
        priority: campaign.status === "live" ? 0.8 : 0.6,
      })

      if (isPublicStatus(campaign.status)) {
        statementEntries.push({
          url: `${origin}/campaigns/${encodedSlug}/statement`,
          ...(lastModified ? { lastModified } : {}),
          changeFrequency: campaign.status === "live" ? "hourly" : "weekly",
          priority: 0.5,
        })
      }

      const organizer = organizers.get(campaign.id)
      if (organizer && isNavigableOrganizerHandle(organizer.handle)) {
        const existing = organizerLastModified.get(organizer.handle)
        if (!organizerLastModified.has(organizer.handle)) {
          organizerLastModified.set(organizer.handle, lastModified)
        } else if (lastModified && (!existing || lastModified.getTime() > existing.getTime())) {
          organizerLastModified.set(organizer.handle, lastModified)
        }
      }
    }

    const organizerEntries: MetadataRoute.Sitemap = []
    for (const [handle, lastModified] of organizerLastModified) {
      organizerEntries.push({
        url: `${origin}/u/${encodeURIComponent(handle)}`,
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: "weekly",
        priority: 0.7,
      })
    }

    return [...staticEntries, ...campaignEntries, ...statementEntries, ...organizerEntries]
  } catch (error) {
    console.warn("sitemap: failed to load public campaigns; returning static entries only", error)
    return staticEntries
  }
}
