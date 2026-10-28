"use client"

import { useEffect, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Eye,
  MessageSquare,
  Pin,
  User,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

interface ProjectUpdate {
  id: string
  documentId: string
  Title: string
  Content: string
  Excerpt?: string
  IsPublic: boolean
  IsPinned: boolean
  ViewCount: number
  createdAt: string
  updatedAt: string
  publishedAt: string
  Author?: {
    username: string
    email: string
    avatar?: string
  }
  Images?: Array<{
    url: string
    alternativeText?: string
  }>
  Comments?: Array<any>
}

interface ProjectUpdatesProps {
  projectId: string
  projectTitle?: string
  authorName?: string
}

export default function ProjectUpdates({
  projectId,
  projectTitle,
  authorName,
}: ProjectUpdatesProps) {
  const [updates, setUpdates] = useState<ProjectUpdate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedUpdates, setExpandedUpdates] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchUpdates()
  }, [projectId])

  const fetchUpdates = async () => {
    try {
      setLoading(true)

      // Build query string manually to handle Strapi's filter syntax
      let queryString = ""

      // projectId can be either documentId or numeric id
      if (projectId.includes("-")) {
        // It's a documentId
        queryString = `filters[Project][documentId][$eq]=${projectId}`
      } else {
        // It's a numeric id
        queryString = `filters[Project][id][$eq]=${projectId}`
      }

      // Add other parameters
      queryString += "&populate[Author]=true"
      queryString += "&populate[Images]=true"
      queryString += "&populate[Comments]=true"
      queryString += "&sort[0]=IsPinned:desc"
      queryString += "&sort[1]=createdAt:desc"
      queryString += "&pagination[page]=1"
      queryString += "&pagination[pageSize]=20"

      console.log("Fetching updates with query:", queryString)

      const response = await fetch(`/api/project-updates?${queryString}`)

      if (!response.ok) {
        throw new Error("Failed to fetch updates")
      }

      const data = await response.json()
      console.log("Updates data:", data)
      setUpdates(data.data || [])
    } catch (err) {
      console.error("Error fetching updates:", err)
      setError(err instanceof Error ? err.message : "Failed to load updates")
    } finally {
      setLoading(false)
    }
  }

  const toggleUpdateExpansion = (updateId: string) => {
    setExpandedUpdates((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(updateId)) {
        newSet.delete(updateId)
      } else {
        newSet.add(updateId)
      }
      return newSet
    })
  }

  const formatContent = (content: string) => {
    // Convert markdown-style content to HTML
    return content
      .split("\n\n")
      .map((paragraph) => `<p class="mb-4">${paragraph}</p>`)
      .join("")
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <p className="text-red-500">Error loading updates: {error}</p>
          <Button onClick={fetchUpdates} variant="outline" className="mt-4">
            Try Again
          </Button>
        </CardContent>
      </Card>
    )
  }

  if (updates.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <MessageSquare className="mx-auto mb-4 h-12 w-12 text-gray-400" />
          <h3 className="mb-2 text-lg font-medium text-gray-900">
            No updates yet
          </h3>
          <p className="text-gray-600">
            The project creator hasn&apos;t posted any updates yet. Check back
            later!
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {updates.map((update) => {
        const isExpanded = expandedUpdates.has(update.documentId)
        const hasLongContent = update.Content.length > 300
        const displayContent =
          hasLongContent && !isExpanded
            ? update.Excerpt || update.Content.substring(0, 300) + "..."
            : update.Content

        return (
          <Card
            key={update.documentId}
            className={cn(
              "overflow-hidden",
              update.IsPinned && "border-primary"
            )}
          >
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    {update.IsPinned && (
                      <Badge variant="secondary" className="gap-1">
                        <Pin className="h-3 w-3" />
                        Pinned
                      </Badge>
                    )}
                    {!update.IsPublic && (
                      <Badge variant="outline">Backers Only</Badge>
                    )}
                  </div>

                  <CardTitle className="text-xl">{update.Title}</CardTitle>

                  <div className="text-muted-foreground mt-2 flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDistanceToNow(new Date(update.createdAt), {
                        addSuffix: true,
                      })}
                    </div>

                    <div className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {update.Author?.username ||
                        authorName ||
                        "Project Creator"}
                    </div>

                    {update.ViewCount > 0 && (
                      <div className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {update.ViewCount} views
                      </div>
                    )}

                    {update.Comments && update.Comments.length > 0 && (
                      <div className="flex items-center gap-1">
                        <MessageSquare className="h-3 w-3" />
                        {update.Comments.length} comments
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              <div
                className="prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{
                  __html: formatContent(displayContent),
                }}
              />

              {update.Images && update.Images.length > 0 && (
                <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3">
                  {update.Images.map((image, index) => (
                    <img
                      key={index}
                      src={image.url}
                      alt={image.alternativeText || `Update image ${index + 1}`}
                      className="h-32 w-full rounded-lg object-cover"
                    />
                  ))}
                </div>
              )}

              {hasLongContent && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => toggleUpdateExpansion(update.documentId)}
                  className="mt-4 gap-1"
                >
                  {isExpanded ? (
                    <>
                      Show less
                      <ChevronUp className="h-4 w-4" />
                    </>
                  ) : (
                    <>
                      Read more
                      <ChevronDown className="h-4 w-4" />
                    </>
                  )}
                </Button>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
