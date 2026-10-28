"use client"

import { useState } from "react"
import { Play } from "lucide-react"

import { getYouTubeEmbedUrl, getYouTubeThumbnail } from "@/lib/youtube"
import { Button } from "@/components/ui/button"

interface YouTubePlayerProps {
  videoId: string
  title?: string
  className?: string
  autoplay?: boolean
  showThumbnail?: boolean
}

export function YouTubePlayer({
  videoId,
  title = "Video",
  className = "",
  autoplay = false,
  showThumbnail = true,
}: YouTubePlayerProps) {
  const [isPlaying, setIsPlaying] = useState(autoplay)

  const handlePlay = () => {
    setIsPlaying(true)
  }

  if (!isPlaying && showThumbnail) {
    return (
      <div
        className={`group relative aspect-video cursor-pointer overflow-hidden rounded-lg bg-gray-100 ${className}`}
        role="button"
        tabIndex={0}
        aria-label={`Play ${title}`}
        onClick={handlePlay}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault()
            handlePlay()
          }
        }}
      >
        <img
          src={getYouTubeThumbnail(videoId, "high")}
          alt={title}
          className="h-full w-full object-cover"
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/30">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-600 shadow-lg hover:bg-red-700">
            <Play className="ml-1 h-6 w-6 fill-current text-white" />
          </div>
        </div>
        <div className="absolute right-2 bottom-2 rounded bg-black/80 px-2 py-1 text-xs text-white">
          YouTube
        </div>
      </div>
    )
  }

  return (
    <div className={`aspect-video overflow-hidden rounded-lg ${className}`}>
      <iframe
        src={getYouTubeEmbedUrl(videoId, true, false)}
        title={title}
        className="h-full w-full"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    </div>
  )
}
