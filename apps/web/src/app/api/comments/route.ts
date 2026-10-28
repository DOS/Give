import { NextRequest, NextResponse } from "next/server"
import { env } from "@/env.mjs"

const STRAPI_URL = process.env.STRAPI_URL || "http://localhost:1338"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Forward all query params to Strapi
    const queryString = searchParams.toString()

    const response = await fetch(`${STRAPI_URL}/api/comments?${queryString}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.STRAPI_REST_CUSTOM_API_KEY}`,
      },
      next: { revalidate: 60 }, // Cache for 60 seconds
    })

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch comments" },
        { status: response.status }
      )
    }

    const data = await response.json()

    // Transform data to include proper image URLs for author avatars
    if (data.data) {
      const transformComment = (comment: any): any => {
        if (
          comment.Author?.avatar?.url &&
          !comment.Author.avatar.url.startsWith("http")
        ) {
          comment.Author.avatar.url = `${STRAPI_URL}${comment.Author.avatar.url}`
        }
        if (comment.Replies) {
          comment.Replies = comment.Replies.map(transformComment)
        }
        return comment
      }

      data.data = data.data.map(transformComment)
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("Error fetching comments:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.Content || !body.Project) {
      return NextResponse.json(
        { error: "Content and Project are required" },
        { status: 400 }
      )
    }

    // Prepare data for Strapi
    const commentData = {
      data: {
        Content: body.Content,
        Project: {
          connect: [{ documentId: body.Project }],
        },
        Parent: body.Parent
          ? {
              connect: [{ documentId: body.Parent }],
            }
          : null,
        IsApproved: body.IsApproved !== undefined ? body.IsApproved : false,
        IsEdited: false,
        Likes: 0,
        IsReported: false,
        // Note: Author would be set if user is authenticated
        // For MVP, comments are anonymous
      },
    }

    // Send to Strapi - no auth for public comment creation
    const response = await fetch(`${STRAPI_URL}/api/comments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commentData),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error("Strapi error:", error)
      return NextResponse.json(
        { error: "Failed to create comment" },
        { status: response.status }
      )
    }

    const result = await response.json()

    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.error("Error creating comment:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
