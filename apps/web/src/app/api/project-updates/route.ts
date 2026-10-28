import { NextRequest, NextResponse } from "next/server"
import { env } from "@/env.mjs"

const STRAPI_URL = process.env.STRAPI_URL || "http://localhost:1338"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Forward all query params to Strapi
    const queryString = searchParams.toString()

    const response = await fetch(
      `${STRAPI_URL}/api/project-updates?${queryString}`,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.STRAPI_REST_CUSTOM_API_KEY}`,
        },
        next: { revalidate: 60 }, // Cache for 60 seconds
      }
    )

    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch updates" },
        { status: response.status }
      )
    }

    const data = await response.json()

    // Transform data to include proper image URLs
    if (data.data && Array.isArray(data.data)) {
      data.data = data.data.map((update: any) => ({
        ...update,
        Images: update.Images?.map((image: any) => ({
          url: image.url.startsWith("http")
            ? image.url
            : `${STRAPI_URL}${image.url}`,
          alternativeText: image.alternativeText,
        })),
      }))
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error("Error fetching project updates:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
