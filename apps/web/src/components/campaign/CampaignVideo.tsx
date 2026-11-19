"use client"

import Image from "next/image"
import { useState } from "react"

export const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

export function isValidYoutubeId(value: string | null | undefined): value is string {
  return typeof value === "string" && YOUTUBE_ID_PATTERN.test(value)
}

/**
 * Privacy-preserving click-to-play YouTube pitch video (DOS/Give#268).
 *
 * Before interaction, only the poster image is requested through Next.js's
 * image optimizer (`i.ytimg.com/vi/<id>/hqdefault.jpg`), so the visitor's
 * browser makes zero requests to YouTube or Google. Clicking mounts the
 * `youtube-nocookie.com` embed iframe.
 */
export function CampaignVideo({ youtubeId, title, alt }: { youtubeId: string; title: string; alt?: string | null }) {
  const [playingId, setPlayingId] = useState<string | null>(null)
  if (!isValidYoutubeId(youtubeId)) return null

  const cleanAlt = alt?.trim() || null
  const label = cleanAlt || title.trim() || "Video giới thiệu chiến dịch"
  const iframeTitle = cleanAlt || title
  const playing = playingId === youtubeId

  return (
    <div>
      <div className="relative aspect-video overflow-hidden rounded-md bg-surface">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0`}
            title={iframeTitle}
            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
            className="absolute inset-0 h-full w-full border-0"
          />
        ) : (
          <>
            <Image
              src={`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`}
              alt={label}
              fill
              sizes="(min-width: 1024px) 792px, 100vw"
              className="object-cover"
            />
            <button
              type="button"
              onClick={() => setPlayingId(youtubeId)}
              aria-label={`Phát video: ${label}`}
              className="group absolute inset-0 flex min-h-11 w-full cursor-pointer items-center justify-center bg-scrim p-4 transition-colors duration-150 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary"
            >
              <span className="inline-flex min-h-11 items-center gap-2 rounded border border-border bg-raised px-4 py-2 text-base font-semibold text-fg transition-colors duration-150 group-hover:bg-surface">
                <svg
                  viewBox="0 0 24 24"
                  width={20}
                  height={20}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                  focusable="false"
                  className="shrink-0 text-primary"
                >
                  <polygon points="6 4 20 12 6 20 6 4" />
                </svg>
                <span>Phát video</span>
              </span>
            </button>
          </>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm text-muted">
        <span>{playing ? (cleanAlt ?? "Đang phát video từ YouTube") : "Bấm để phát video từ YouTube"}</span>
        <a
          href={`https://www.youtube.com/watch?v=${youtubeId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex min-h-11 items-center link"
        >
          Mở trên YouTube
        </a>
      </div>
    </div>
  )
}
