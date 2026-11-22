import { readFile } from "node:fs/promises"
import { ImageResponse } from "next/og"

import { getCampaignBySlug, getPublicOrganizer } from "@/lib/campaigns"
import { PUBLIC_COVER_CACHE } from "@/lib/cover-route"
import { SLUG_PATTERN } from "@/lib/slug"
import { getMoneyTotals } from "@/lib/statement"
import { dbAs } from "@/lib/supabase"
import { buildOgCampaignCardModel, isOgEligible } from "@/lib/viral-sharing"

export const alt = "Chiến dịch gây quỹ minh bạch trên Give"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

interface FontBuffers {
  regular: Buffer
  bold: Buffer
}

let fontPromise: Promise<FontBuffers> | null = null

function loadFonts(): Promise<FontBuffers> {
  if (!fontPromise) {
    fontPromise = Promise.all([
      readFile(new URL("../../../assets/fonts/BeVietnamPro-Regular.ttf", import.meta.url)),
      readFile(new URL("../../../assets/fonts/BeVietnamPro-Bold.ttf", import.meta.url)),
    ])
      .then(([regular, bold]) => ({ regular, bold }))
      .catch((error: unknown) => {
        fontPromise = null
        throw error
      })
  }
  return fontPromise
}

function notFoundResponse(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: { "Cache-Control": "no-store" },
  })
}

/**
 * Dynamic Open Graph card for public /campaigns/[slug] pages (DOS/Give#313).
 *
 * Security invariants:
 * - Reads anonymously via dbAs() only and returns 404 for drafts, previews,
 *   suspended, cancelled, invalid, or nonexistent campaigns.
 * - Zero SSRF: never fetches any remote URL; renders with local bundled
 *   Be Vietnam Pro TTF fonts for crisp Vietnamese diacritics.
 */
export default async function CampaignOpenGraphImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  if (!SLUG_PATTERN.test(slug) || slug.length > 80) return notFoundResponse()

  const anon = dbAs()
  const campaign = await getCampaignBySlug(anon, slug)
  if (!isOgEligible(campaign) || !campaign) return notFoundResponse()

  const [totals, organizer, fonts] = await Promise.all([
    getMoneyTotals(anon, campaign.id).catch(() => null),
    getPublicOrganizer(anon, campaign.id).catch(() => null),
    loadFonts(),
  ])

  const model = buildOgCampaignCardModel({ campaign, totals, organizer })
  if (!model) return notFoundResponse()

  const isGive = model.type === "give"
  const barColor = isGive ? "#047857" : "#C2410C"
  const badgeBg = isGive ? "#ECFDF5" : "#FFF7ED"
  const badgeColor = isGive ? "#047857" : "#C2410C"
  const progressWidth = `${Math.max(0, Math.min(100, model.percent))}%`

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#FFFFFF",
        color: "#111318",
        fontFamily: '"Be Vietnam Pro"',
      }}
    >
      <div style={{ width: "100%", height: "10px", backgroundColor: barColor, display: "flex" }} />
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "48px 64px 44px",
        }}
      >
        {/* Top row: badges and Give wordmark */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                backgroundColor: badgeBg,
                color: badgeColor,
                fontSize: "20px",
                fontWeight: 700,
                padding: "8px 16px",
                borderRadius: "4px",
                marginRight: "12px",
              }}
            >
              {model.typeBadge}
            </div>
            {model.verifiedStatementBadge && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  backgroundColor: "#ECFDF5",
                  color: "#047857",
                  fontSize: "18px",
                  fontWeight: 700,
                  padding: "8px 16px",
                  borderRadius: "4px",
                  marginRight: "12px",
                }}
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#047857"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ marginRight: "8px" }}
                >
                  <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6Z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
                {model.verifiedStatementBadge}
              </div>
            )}
            {model.statusBadge && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  backgroundColor: "#F7F8FA",
                  color: "#5B6270",
                  border: "1px solid #E6E8EC",
                  fontSize: "18px",
                  fontWeight: 700,
                  padding: "7px 14px",
                  borderRadius: "4px",
                }}
              >
                {model.statusBadge}
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "4px",
                backgroundColor: "#047857",
                color: "#FFFFFF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "22px",
                fontWeight: 700,
                marginRight: "10px",
              }}
            >
              G
            </div>
            <div style={{ display: "flex", fontSize: "28px", fontWeight: 700, color: "#111318" }}>Give</div>
          </div>
        </div>

        {/* Title & organizer */}
        <div style={{ display: "flex", flexDirection: "column", marginTop: "20px", marginBottom: "20px" }}>
          <div
            style={{
              display: "flex",
              fontSize: model.title.length > 62 ? "40px" : "46px",
              fontWeight: 700,
              lineHeight: 1.24,
              color: "#111318",
            }}
          >
            {model.title}
          </div>
          {model.organizerName && (
            <div
              style={{ display: "flex", alignItems: "center", marginTop: "16px", fontSize: "22px", color: "#5B6270" }}
            >
              <span style={{ display: "flex" }}>{model.organizerName}</span>
              {model.organizerVerified && (
                <span
                  style={{
                    display: "flex",
                    alignItems: "center",
                    color: "#047857",
                    fontWeight: 700,
                    marginLeft: "12px",
                    fontSize: "18px",
                  }}
                >
                  · Đã xác minh
                </span>
              )}
            </div>
          )}
        </div>

        {/* Funding summary panel */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            backgroundColor: "#F7F8FA",
            border: "1px solid #E6E8EC",
            borderRadius: "6px",
            padding: "24px 28px",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <span style={{ display: "flex", fontSize: "40px", fontWeight: 700, color: "#111318" }}>
                {model.raisedText}
              </span>
              <span style={{ display: "flex", fontSize: "20px", color: "#5B6270", marginLeft: "14px" }}>
                {model.raisedLabel}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "baseline" }}>
              <span style={{ display: "flex", fontSize: "20px", color: "#5B6270" }}>{model.goalText}</span>
              <span
                style={{ display: "flex", fontSize: "26px", fontWeight: 700, color: "#047857", marginLeft: "14px" }}
              >
                {model.percent}%
              </span>
            </div>
          </div>

          {model.showProgressBar && (
            <div
              style={{
                width: "100%",
                height: "12px",
                backgroundColor: "#E6E8EC",
                borderRadius: "4px",
                marginTop: "18px",
                overflow: "hidden",
                display: "flex",
              }}
            >
              <div
                style={{
                  width: progressWidth,
                  height: "100%",
                  backgroundColor: "#047857",
                  borderRadius: "4px",
                  display: "flex",
                }}
              />
            </div>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: "16px",
              fontSize: "18px",
              color: "#5B6270",
            }}
          >
            <span style={{ display: "flex" }}>{model.supportersText ?? "Theo dõi sao kê công khai"}</span>
            <span style={{ display: "flex", color: "#047857", fontWeight: 700 }}>{model.footerText}</span>
          </div>
        </div>
      </div>
    </div>,
    {
      ...size,
      headers: {
        "Cache-Control": PUBLIC_COVER_CACHE,
        "X-Content-Type-Options": "nosniff",
      },
      fonts: [
        { name: "Be Vietnam Pro", data: fonts.regular, weight: 400, style: "normal" },
        { name: "Be Vietnam Pro", data: fonts.bold, weight: 700, style: "normal" },
      ],
    }
  )
}
