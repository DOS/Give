import type { StrapiCollectionResponse, StrapiResponse } from "../types"

import { PublicStrapiClient } from "../index"

export interface ProjectData {
  id: number
  documentId: string
  title: string
  description: string
  shortDescription?: string
  slug: string
  type: "give" | "back"
  category:
    | "technology"
    | "health"
    | "education"
    | "environment"
    | "arts"
    | "community"
    | "business"
    | "sports"
    | "travel"
    | "food"
    | "fashion"
    | "games"
    | "film"
    | "music"
    | "publishing"
  projectStatus: "draft" | "active" | "funded" | "ended" | "cancelled"
  fundingGoal: number
  currentFunding: number
  currency: "USD" | "EUR" | "GBP" | "VND"
  backersCount: number
  startDate: string
  endDate: string
  featured: boolean
  createdAt: string
  updatedAt: string
  publishedAt: string
  locale: string
  images?: {
    data: Array<{
      id: number
      documentId: string
      url: string
      alternativeText?: string
      caption?: string
      width: number
      height: number
      formats?: Record<string, any>
    }>
  }
  video?: {
    data?: {
      id: number
      documentId: string
      url: string
      alternativeText?: string
      caption?: string
    }
  }
  videoUrl?: string
  videoUrls?: Array<{
    id: number
    title?: string
    url: string
  }>
  creator?: {
    data: {
      id: number
      documentId: string
      username: string
      email: string
      firstName?: string
      lastName?: string
      avatar?: {
        data: {
          id: number
          documentId: string
          url: string
          alternativeText?: string
        }
      }
    }
  }
  tags?: {
    data: Array<{
      id: number
      documentId: string
      name: string
      slug: string
      color: string
    }>
  }
  rewards?: Array<{
    id: number
    title: string
    description: string
    amount: number
    currency: string
    estimatedDelivery?: string
    limitedQuantity?: number
    claimedQuantity: number
    isActive: boolean
    image?: {
      data: {
        id: number
        documentId: string
        url: string
        alternativeText?: string
      }
    }
  }>
}

export interface ProjectsFilters {
  type?: "give" | "back"
  category?: string
  projectStatus?: string
  featured?: boolean
  locale?: string
}

export interface ProjectsSort {
  field:
    | "createdAt"
    | "updatedAt"
    | "title"
    | "fundingGoal"
    | "currentFunding"
    | "endDate"
  order: "asc" | "desc"
}

/**
 * Fetch all projects with optional filters and pagination
 * Note: Since we don't have a Project content type in Strapi yet, this will return mock data
 */
export async function fetchProjects({
  filters = {},
  sort = { field: "createdAt", order: "desc" },
  pagination = { page: 1, pageSize: 10 },
  populate = ["Media", "Creator", "Tags"],
}: {
  filters?: ProjectsFilters
  sort?: ProjectsSort
  pagination?: { page: number; pageSize: number }
  populate?: string[]
} = {}): Promise<StrapiCollectionResponse<ProjectData>> {
  try {
    const queryParams: Record<string, any> = {}

    // Filters
    if (filters.type) queryParams["filters[Type][$eq]"] = filters.type
    if (filters.category)
      queryParams["filters[Category][$eq]"] = filters.category
    if (filters.projectStatus)
      queryParams["filters[ProjectStatus][$eq]"] = filters.projectStatus
    if (filters.featured !== undefined)
      queryParams["filters[Featured][$eq]"] = filters.featured
    if (filters.locale) queryParams["locale"] = filters.locale

    // Sort
    queryParams["sort[0]"] = `${sort.field}:${sort.order}`

    // Pagination
    queryParams["pagination[page]"] = pagination.page
    queryParams["pagination[pageSize]"] = pagination.pageSize

    // Populate - need to handle array for qs.stringify
    if (populate.length > 0) {
      queryParams["populate"] = populate
    }

    const data = await PublicStrapiClient.fetchAPI("/projects", queryParams)

    const transformed = (data.data as any[]).map(transformStrapiProject)

    return { data: transformed, meta: data.meta }
  } catch (err) {
    console.error("Error fetching projects:", err)
    return {
      data: [],
      meta: { pagination: { page: 1, pageSize: 10, pageCount: 0, total: 0 } },
    }
  }
}

/**
 * Fetch featured projects
 */
export async function fetchFeaturedProjects(
  limit: number = 6
): Promise<ProjectData[]> {
  try {
    const response = await fetchProjects({
      filters: { featured: true },
      pagination: { page: 1, pageSize: limit },
    })
    return response.data
  } catch (error) {
    console.error("Error fetching featured projects:", error)
    return []
  }
}

/**
 * Fetch project by ID from Strapi API
 */
export async function fetchProjectById(
  id: string
): Promise<ProjectData | null> {
  try {
    console.log(`Fetching project by ID: ${id}`)

    // First try to fetch from Strapi API
    const apiUrl =
      process.env.NEXT_PUBLIC_STRAPI_API_URL || "http://localhost:1338"
    const response = await fetch(`${apiUrl}/api/projects/${id}?populate=*`)

    if (response.ok) {
      const strapiProject = await response.json()
      console.log(`Strapi project data:`, strapiProject)

      if (strapiProject?.data) {
        // Transform Strapi response to ProjectData format
        const project = strapiProject.data
        return {
          id: project.id,
          documentId: project.documentId || id,
          title: project.title || project.Title || "Untitled Project",
          description: project.description || project.Description || "",
          shortDescription:
            project.shortDescription || project.description || "",
          slug: project.slug || id,
          type: project.type || project.Type || "give",
          category: project.category || project.Category || "technology",
          projectStatus:
            project.projectStatus || project.ProjectStatus || "active",
          fundingGoal: project.fundingGoal || project.FundingGoal || 0,
          currentFunding: project.currentFunding || project.CurrentFunding || 0,
          currency: project.currency || "USD",
          backersCount: project.backersCount || project.BackersCount || 0,
          startDate:
            project.startDate || project.StartDate || new Date().toISOString(),
          endDate:
            project.endDate ||
            project.EndDate ||
            new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          featured: project.featured || false,
          createdAt: project.createdAt || new Date().toISOString(),
          updatedAt: project.updatedAt || new Date().toISOString(),
          publishedAt: project.publishedAt || new Date().toISOString(),
          locale: project.locale || "en",
          images:
            project.images || project.Image
              ? {
                  data: Array.isArray(project.images?.data)
                    ? project.images.data
                    : project.Image?.data
                      ? [project.Image.data]
                      : [],
                }
              : undefined,
        }
      }
    }

    console.log(`Strapi API failed, fallback to mock data for ID: ${id}`)

    // Fallback to mock data
    const mockProjects: ProjectData[] = [
      {
        id: 1,
        documentId: "project-1",
        title: "Smart Water Purifier",
        description:
          "Revolutionary water purification system using AI and IoT technology to provide clean drinking water in remote areas.",
        shortDescription:
          "AI-powered water purification for remote communities",
        slug: "smart-water-purifier",
        category: "technology",
        projectStatus: "active",
        fundingGoal: 50000,
        currentFunding: 32500,
        currency: "USD",
        backersCount: 127,
        startDate: "2025-01-01T00:00:00.000Z",
        endDate: "2025-03-01T00:00:00.000Z",
        featured: true,
        createdAt: "2025-01-01T00:00:00.000Z",
        updatedAt: "2025-01-15T00:00:00.000Z",
        publishedAt: "2025-01-01T00:00:00.000Z",
        locale: "en",
      },
      {
        id: 2,
        documentId: "15da6f3646074a639ee966a8280e", // Match the real ID from URL
        title: "Ủng hộ nạn nhân động đất ở xxx",
        description:
          "Hãy giúp đỡ nạn nhân động đất ở xxx Hãy giúp đỡ nạn nhân động đất ở xxx",
        shortDescription: "Hãy giúp đỡ nạn nhân động đất ở xxx",
        slug: "ung-ho-nan-nhan-dong-dat-o-xxx",
        category: "health",
        projectStatus: "active",
        fundingGoal: 500000,
        currentFunding: 1000000,
        currency: "USD",
        backersCount: 3232,
        startDate: "2025-06-29T17:00:00.000Z",
        endDate: "2025-06-15T17:00:00.000Z",
        featured: false,
        createdAt: "2025-06-16T04:27:58.303Z",
        updatedAt: "2025-06-16T10:12:09.998Z",
        publishedAt: "2025-06-16T10:12:10.071Z",
        locale: "en",
      },
      {
        id: 3,
        documentId: "project-3",
        title: "Educational VR Platform",
        description:
          "Immersive virtual reality platform for interactive learning experiences in schools and universities.",
        shortDescription: "VR platform for immersive educational experiences",
        slug: "educational-vr-platform",
        category: "education",
        projectStatus: "active",
        fundingGoal: 75000,
        currentFunding: 45000,
        currency: "USD",
        backersCount: 203,
        startDate: "2025-02-01T00:00:00.000Z",
        endDate: "2025-05-01T00:00:00.000Z",
        featured: true,
        createdAt: "2025-02-01T00:00:00.000Z",
        updatedAt: "2025-02-10T00:00:00.000Z",
        publishedAt: "2025-02-01T00:00:00.000Z",
        locale: "en",
      },
    ]

    // Try to find by documentId first, then by slug
    let project = mockProjects.find((project) => project.documentId === id)
    if (!project) {
      project = mockProjects.find((project) => project.slug === id)
    }

    if (project) {
      console.log(`Found mock project:`, project)
      return project
    }

    console.log(`Project not found for ID: ${id}`)
    return null
  } catch (error) {
    console.error("Error fetching project by ID:", error)
    return null
  }
}

/**
 * Fetch project statistics
 */
export async function fetchProjectStats(): Promise<{
  totalFunded: number
  activeProjects: number
  totalBackers: number
  successRate: number
}> {
  try {
    const response = await fetchProjects()
    const projects = response.data

    const totalFunded = projects.reduce(
      (sum, project) => sum + project.currentFunding,
      0
    )
    const activeProjects = projects.filter(
      (project) => project.projectStatus === "active"
    ).length
    const totalBackers = projects.reduce(
      (sum, project) => sum + project.backersCount,
      0
    )
    const fundedProjects = projects.filter(
      (project) => project.projectStatus === "funded"
    ).length
    const successRate =
      projects.length > 0 ? (fundedProjects / projects.length) * 100 : 0

    return {
      totalFunded,
      activeProjects,
      totalBackers,
      successRate,
    }
  } catch (error) {
    console.error("Error fetching project stats:", error)
    return {
      totalFunded: 0,
      activeProjects: 0,
      totalBackers: 0,
      successRate: 0,
    }
  }
}

/**
 * Get a single project by ID - wrapper for project detail page
 */
export async function getProject(id: string) {
  try {
    console.log(`Fetching project by ID: ${id}`)

    // Try to fetch from Strapi API by documentId using PublicStrapiClient
    try {
      const strapiProject = await PublicStrapiClient.fetchOne(
        "api::project.project",
        id,
        { populate: "*" }
      )

      if (strapiProject?.data) {
        console.log(`Strapi project by documentId:`, strapiProject.data)
        return transformStrapiProject(strapiProject.data)
      }
    } catch (error) {
      console.log(`DocumentId fetch failed, trying by slug: ${id}`)
    }

    // If documentId doesn't work, try by slug (fallback)
    try {
      const strapiProjects = await PublicStrapiClient.fetchMany(
        "api::project.project",
        {
          filters: { Slug: { $eq: id } },
          populate: "*",
        }
      )

      if (strapiProjects?.data && strapiProjects.data.length > 0) {
        console.log(`Strapi projects by slug:`, strapiProjects.data)
        const project = strapiProjects.data[0]
        return transformStrapiProject(project)
      }
    } catch (error) {
      console.log(`Slug fetch failed for: ${id}`)
    }

    console.log(`Project not found by documentId or slug: ${id}`)
    return null
  } catch (error) {
    console.error(`Error fetching project by ID ${id}:`, error)
    return null
  }
}

/**
 * Get a single project by slug - wrapper for project detail page
 */
export async function getProjectBySlug(slug: string) {
  try {
    console.log(`Fetching project by slug: ${slug}`)

    // Try to find by slug using PublicStrapiClient
    try {
      const strapiProjects = await PublicStrapiClient.fetchMany(
        "api::project.project",
        {
          filters: { Slug: { $eq: slug } },
          populate: {
            Media: true,
            Category: true,
            Creator: true,
            Tags: true,
            Rewards: true,
            Updates: true,
            Donations: true,
            Comments: true,
            Seo: true,
            MediaURL: true,
          },
        }
      )

      if (strapiProjects?.data && strapiProjects.data.length > 0) {
        console.log(`Strapi projects by slug:`, strapiProjects.data)
        const project = strapiProjects.data[0]
        return transformStrapiProject(project)
      }
    } catch (error) {
      console.log(`Slug fetch failed: ${error}`)
    }

    // If slug doesn't work, try by documentId (fallback for old URLs)
    try {
      const strapiProject = await PublicStrapiClient.fetchOne(
        "api::project.project",
        slug,
        {
          populate: {
            Media: true,
            Category: true,
            Creator: true,
            Tags: true,
            Rewards: true,
            Updates: true,
            Donations: true,
            Comments: true,
            Seo: true,
            MediaURL: true,
          },
        }
      )

      if (strapiProject?.data) {
        console.log(`Strapi project by documentId:`, strapiProject.data)
        return transformStrapiProject(strapiProject.data)
      }
    } catch (error) {
      console.log(`DocumentId fetch failed: ${error}`)
    }

    console.log(`Project not found by slug or documentId: ${slug}`)
    return null
  } catch (error) {
    console.error(`Error fetching project by slug ${slug}:`, error)
    return null
  }
}

/**
 * Transform Strapi project data to our format
 */
function transformStrapiProject(project: any) {
  const baseUrl = "http://localhost:1338"

  return {
    id: project.documentId || project.id,
    Title: project.Title,
    Description: project.Description,
    ShortDescription: project.ShortDescription,
    LongDescription: project.Description,
    Type: project.Type || "give",
    Images:
      project.Media?.map((image: any) => ({
        url: image.url.startsWith("http")
          ? image.url
          : `${baseUrl}${image.url}`,
        alternativeText: image.alternativeText || project.Title,
        width: image.width,
        height: image.height,
      })) || [],
    // Keep single Image for backward compatibility
    Image: project.Media?.[0]
      ? {
          url: project.Media[0].url.startsWith("http")
            ? project.Media[0].url
            : `${baseUrl}${project.Media[0].url}`,
          alternativeText: project.Media[0].alternativeText || project.Title,
        }
      : undefined,
    FundingGoal: project.FundingGoal,
    CurrentFunding: project.CurrentFunding,
    BackersCount: project.BackersCount,
    DaysLeft: project.EndDate
      ? Math.ceil(
          (new Date(project.EndDate).getTime() - new Date().getTime()) /
            (1000 * 3600 * 24)
        )
      : null,
    Category:
      typeof project.Category === "object" && project.Category
        ? project.Category.Name
        : project.Category || "General",
    CreatedBy:
      project.Creator?.username ||
      project.Creator?.email ||
      "Anonymous Creator",
    Location: project.Location || "Global",
    Slug: project.Slug,

    // Video support
    video: project.video,
    videoUrl: project.videoUrl,
    videoUrls: project.MediaURL || [],
    Rewards:
      (project.Rewards || project.rewards || [])?.map((reward: any) => {
        // Support both PascalCase and camelCase properties coming from Strapi
        const title = reward.Title || reward.title || "Reward"
        const amount = reward.Amount ?? reward.amount ?? 0
        const currency = reward.Currency || reward.currency || "USD"
        const image = reward.Image || reward.image
        return {
          id: reward.id,
          Title: title,
          Description: reward.Description || reward.description || "",
          Amount: amount,
          Currency: currency,
          EstimatedDelivery:
            reward.EstimatedDelivery || reward.estimatedDelivery,
          LimitedQuantity: reward.LimitedQuantity ?? reward.limitedQuantity,
          ClaimedQuantity:
            reward.ClaimedQuantity ?? reward.claimedQuantity ?? 0,
          IsActive: (reward.IsActive ?? reward.isActive) !== false,
          Image: image
            ? {
                url: image.url.startsWith("http")
                  ? image.url
                  : `${baseUrl}${image.url}`,
                alternativeText: image.alternativeText || title,
              }
            : undefined,
        }
      }) || [],
  }
}
