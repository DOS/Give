"use client"

import { useState } from "react"
import {
  Bookmark,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Facebook,
  Heart,
  Link,
  Mail,
  MapPin,
  Play,
  Share2,
  Twitter,
  Users,
} from "lucide-react"

import type { MediaItem } from "@/lib/youtube"

import { createMediaGallery } from "@/lib/youtube"
import { ImageWithFallback } from "@/components/elementary/ImageWithFallback"
import { YouTubePlayer } from "@/components/elementary/YouTubePlayer"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export interface ProjectDetailHeroProps {
  project: {
    id: string
    Title: string
    Description?: string
    ShortDescription?: string
    Images?: Array<{
      url: string
      alternativeText?: string
      width?: number
      height?: number
    }>
    Image?: {
      url: string
      alternativeText?: string
    }
    video?: any
    videoUrl?: string
    videoUrls?: Array<{
      id: number
      title?: string
      url: string
    }>
    FundingGoal?: number
    CurrentFunding?: number
    BackersCount?: number
    DaysLeft?: number
    Category?: string
    CreatedBy?: string
    Location?: string
  }
}

export function ProjectDetailHero({ project }: ProjectDetailHeroProps) {
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0)

  // Create unified media gallery with images and videos
  const mediaGallery = createMediaGallery(
    project.Images || (project.Image ? [project.Image] : []),
    project.video,
    project.videoUrl,
    project.videoUrls
  )

  const fundingPercentage = project.FundingGoal
    ? Math.round(((project.CurrentFunding || 0) / project.FundingGoal) * 100)
    : 0

  const nextMedia = () => {
    setCurrentMediaIndex((prev) => (prev + 1) % mediaGallery.length)
  }

  const prevMedia = () => {
    setCurrentMediaIndex(
      (prev) => (prev - 1 + mediaGallery.length) % mediaGallery.length
    )
  }

  return (
    <div className="border-b bg-white">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header Section - Title & Description */}
        <div className="mb-8 text-center">
          <h1 className="mb-4 text-2xl leading-tight font-bold text-gray-900 lg:text-3xl xl:text-4xl">
            {project.Title}
          </h1>
          {(project.ShortDescription || project.Description) && (
            <p className="mx-auto max-w-4xl text-lg leading-relaxed text-gray-600">
              {project.ShortDescription || project.Description}
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-10 lg:items-start">
          {/* Left: Project Image Gallery - 60% width */}
          <div className="space-y-4 lg:col-span-6">
            {/* Main Media Display */}
            <div className="relative aspect-video overflow-hidden rounded-lg bg-gray-100">
              {mediaGallery.length > 0 ? (
                <>
                  {/* Render current media item */}
                  {(() => {
                    const currentMedia = mediaGallery[currentMediaIndex]

                    if (!currentMedia) return null

                    switch (currentMedia.type) {
                      case "youtube":
                        return (
                          <YouTubePlayer
                            videoId={currentMedia.videoId!}
                            title={
                              currentMedia.alternativeText || project.Title
                            }
                            className="h-full w-full"
                            showThumbnail={true}
                          />
                        )
                      case "video":
                        return (
                          <video
                            src={currentMedia.url}
                            controls
                            className="h-full w-full object-cover"
                            poster={currentMedia.alternativeText}
                          >
                            <track kind="captions" />
                            Your browser does not support the video tag.
                          </video>
                        )
                      case "image":
                      default:
                        return (
                          <ImageWithFallback
                            src={currentMedia.url}
                            alt={
                              currentMedia.alternativeText ||
                              project.Title ||
                              "Project media"
                            }
                            width={600}
                            height={400}
                            className="h-full w-full object-cover"
                          />
                        )
                    }
                  })()}

                  {/* Navigation arrows for multiple media items */}
                  {mediaGallery.length > 1 && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-1/2 left-2 z-10 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70"
                        onClick={prevMedia}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-1/2 right-2 z-10 -translate-y-1/2 bg-black/50 text-white hover:bg-black/70"
                        onClick={nextMedia}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>

                      {/* Media counter */}
                      <div className="absolute right-2 bottom-2 z-10 rounded bg-black/50 px-2 py-1 text-xs text-white">
                        {currentMediaIndex + 1} / {mediaGallery.length}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <ImageWithFallback
                  src="/placeholder-project.svg"
                  alt="Project placeholder"
                  width={600}
                  height={400}
                  className="h-full w-full object-cover"
                />
              )}
            </div>

            {/* Thumbnail Gallery */}
            {mediaGallery.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {mediaGallery.map((media, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentMediaIndex(index)}
                    aria-label={`View ${media.type} ${index + 1}`}
                    className={`relative flex-shrink-0 overflow-hidden rounded border-2 transition-all ${
                      index === currentMediaIndex
                        ? "border-blue-500"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {media.type === "youtube" ? (
                      <>
                        <img
                          src={`https://img.youtube.com/vi/${media.videoId}/mqdefault.jpg`}
                          alt={
                            media.alternativeText ||
                            `YouTube video ${index + 1}`
                          }
                          className="h-15 w-20 object-cover"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="rounded-full bg-red-600 p-1">
                            <Play className="h-3 w-3 fill-white text-white" />
                          </div>
                        </div>
                      </>
                    ) : media.type === "video" ? (
                      <>
                        <video
                          src={media.url}
                          className="h-15 w-20 object-cover"
                          muted
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="rounded-full bg-black/70 p-1">
                            <Play className="h-3 w-3 fill-white text-white" />
                          </div>
                        </div>
                      </>
                    ) : (
                      <ImageWithFallback
                        src={media.url}
                        alt={
                          media.alternativeText || `Project image ${index + 1}`
                        }
                        width={80}
                        height={60}
                        className="h-15 w-20 object-cover"
                      />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Project Info - 40% width */}
          <div className="space-y-6 lg:col-span-4">
            {/* Category & Status */}
            <div className="mb-4 flex items-center gap-2">
              {project.Category && (
                <Badge variant="secondary" className="text-sm">
                  {project.Category}
                </Badge>
              )}
              <Badge
                variant="outline"
                className="border-green-200 text-green-600"
              >
                Active
              </Badge>
            </div>

            {/* Creator Info */}
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <div className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                <span>by {project.CreatedBy || "Anonymous Creator"}</span>
              </div>
              {project.Location && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  <span>{project.Location}</span>
                </div>
              )}
            </div>

            {/* Funding Progress - Indiegogo Style */}
            <div className="space-y-4">
              {/* Top Stats Row: Amount + Backers */}
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-3xl font-bold text-gray-900">
                    ${(project.CurrentFunding || 0).toLocaleString()}
                    <span className="ml-2 text-base font-normal text-gray-600">
                      USD
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-900">
                    {(project.BackersCount || 0).toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600">backers</div>
                </div>
              </div>

              {/* Progress Bar - Indiegogo Pink/Red Style */}
              <div className="h-3 w-full rounded-full bg-gray-200">
                <div
                  className="h-3 rounded-full bg-gradient-to-r from-pink-500 to-red-500 transition-all duration-300"
                  style={{ width: `${Math.min(fundingPercentage, 100)}%` }}
                />
              </div>

              {/* Bottom Stats Row: Percentage + Days Left */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold text-gray-900">
                    {fundingPercentage}%
                  </span>
                  <span className="text-sm text-gray-600">
                    of ${(project.FundingGoal || 0).toLocaleString()}
                  </span>
                  {fundingPercentage > 100 && (
                    <Badge
                      variant="outline"
                      className="border-green-500 bg-green-50 text-xs text-green-600"
                    >
                      Flexible Goal
                    </Badge>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-900">
                    {project.DaysLeft || 30}
                  </div>
                  <div className="text-sm text-gray-600">days left</div>
                </div>
              </div>

              {/* Goal Status */}
              {fundingPercentage > 100 && (
                <div className="text-sm font-medium text-green-600">
                  🎉 Goal achieved! This project will be funded.
                </div>
              )}
            </div>

            {/* Action Buttons Section - Kickstarter Style */}
            <div className="space-y-4 border-t pt-4">
              {/* Primary Action Button */}
              <Button
                size="lg"
                className="w-full bg-green-600 py-4 text-lg font-semibold text-white hover:bg-green-700"
              >
                Back this project
              </Button>

              {/* Secondary Actions */}
              <div className="flex items-center justify-between">
                {/* Left: Remind Me & Bookmark */}
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-2"
                  >
                    <Bookmark className="h-4 w-4" />
                    Remind me
                  </Button>
                </div>

                {/* Right: Share Actions */}
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="p-2">
                    <Facebook className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="p-2">
                    <Twitter className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="p-2">
                    <Mail className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="p-2">
                    <Link className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* All or Nothing Notice */}
              <div className="rounded border-l-4 border-orange-400 bg-gray-50 p-3 text-sm text-gray-600">
                <span className="font-medium text-gray-900">
                  All or nothing.
                </span>{" "}
                This project will only be funded if it reaches its goal by{" "}
                <span className="font-medium">
                  {project.DaysLeft
                    ? new Date(
                        Date.now() + project.DaysLeft * 24 * 60 * 60 * 1000
                      ).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                        timeZoneName: "short",
                      })
                    : "the deadline"}
                  .
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
