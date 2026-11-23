"use client"

import { useSearchParams } from "next/navigation"
import { Suspense } from "react"

import { buttonClass } from "@/components/ui/Button"
import { parseEmbedOptions, type EmbedTheme } from "@/lib/embed"

function EmbedNotFoundCardBody({ campaignsUrl, theme }: { campaignsUrl: string; theme: EmbedTheme }) {
  return (
    <div
      data-embed-theme={theme}
      className="flex min-h-screen w-full flex-col justify-between overflow-hidden rounded-md border border-border bg-raised p-4 text-fg"
    >
      <div>
        <p className="text-sm font-bold text-primary">Give</p>
        <h1 className="mt-1 text-base font-semibold text-fg">Không tìm thấy chiến dịch</h1>
        <p className="mt-1 line-clamp-2 text-sm text-fg">
          Chiến dịch không tồn tại, chưa công khai hoặc đang tạm dừng.
        </p>
      </div>
      <div className="pt-2">
        <a
          href={campaignsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonClass({ variant: "secondary", size: "sm" })}
        >
          Khám phá chiến dịch
          <span className="sr-only"> (mở thẻ mới)</span>
        </a>
      </div>
    </div>
  )
}

function EmbedNotFoundWithSearch({ campaignsUrl }: { campaignsUrl: string }) {
  const searchParams = useSearchParams()
  const { theme } = parseEmbedOptions({ theme: searchParams.get("theme") ?? undefined })
  return <EmbedNotFoundCardBody campaignsUrl={campaignsUrl} theme={theme} />
}

/**
 * Compact chrome-free not-found card sized for `/embed/*` iframes (including
 * 180px compact embeds) and honoring `?theme=light|dark|auto` (DOS/Give#335).
 */
export function EmbedNotFoundCard({ campaignsUrl = "/campaigns" }: { campaignsUrl?: string }) {
  return (
    <Suspense fallback={<EmbedNotFoundCardBody campaignsUrl={campaignsUrl} theme="light" />}>
      <EmbedNotFoundWithSearch campaignsUrl={campaignsUrl} />
    </Suspense>
  )
}
