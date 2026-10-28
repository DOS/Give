import { AppLocale } from "@/types/general"

import { fetchProjects as strapiApiFetchProjects } from "@/lib/strapi-api/content/project"
import { Container } from "@/components/catalyst/container"
import FiltersSheet from "@/components/crowdfunding/FiltersSheet"
import FiltersSidebar from "@/components/crowdfunding/FiltersSidebar"
import ProjectCard from "@/components/crowdfunding/ProjectCard"
import ProjectsTopControls from "@/components/crowdfunding/ProjectsTopControls"

interface ProjectsPageProps {
  params: Promise<{ locale: AppLocale }>
  searchParams: Promise<{
    type?: string
    category?: string
    status?: string
    search?: string
    page?: string
  }>
}

async function fetchProjectsForPage(locale: AppLocale, searchParams: any) {
  try {
    // Use the Strapi API client which routes through /api/public-proxy
    const result = await strapiApiFetchProjects({
      filters: {
        type: searchParams.type,
        category: searchParams.category,
        projectStatus: searchParams.status,
        locale: locale,
      },
      sort: {
        field: "createdAt",
        order: "desc",
      },
      pagination: {
        page: parseInt(searchParams.page || "1"),
        pageSize: 12,
      },
      populate: ["Media", "Category", "Tags"],
    })

    console.log("Projects fetched:", result?.data?.length || 0)
    return result
  } catch (error) {
    console.error("Error fetching projects:", error)
    return null
  }
}

export default async function ProjectsPage({
  params,
  searchParams,
}: ProjectsPageProps) {
  const resolvedParams = await params
  const resolvedSearchParams = await searchParams

  const projectsData = await fetchProjectsForPage(
    resolvedParams.locale,
    resolvedSearchParams
  )
  const projects = projectsData?.data || []
  const pagination = projectsData?.meta?.pagination

  return (
    <Container>
      {/* Page Header */}
      <div className="mx-auto max-w-2xl pt-12 pb-8 text-center">
        <h1 className="mb-4 text-4xl font-bold text-gray-900">
          Discover Projects
        </h1>
        <p className="text-lg text-gray-600">
          Support innovative projects and help bring creative ideas to life.
          Browse through our curated collection of campaigns.
        </p>
      </div>

      {/* Mobile filter toggle */}
      <FiltersSheet
        currentType={resolvedSearchParams.type}
        currentCategory={resolvedSearchParams.category}
        currentStatus={resolvedSearchParams.status}
        currentSearch={resolvedSearchParams.search}
      />

      <div className="flex gap-8 pb-12">
        {/* Sidebar filters (desktop) */}
        <FiltersSidebar
          currentType={resolvedSearchParams.type}
          currentCategory={resolvedSearchParams.category}
          currentStatus={resolvedSearchParams.status}
          currentSearch={resolvedSearchParams.search}
        />

        {/* Main content */}
        <div className="flex-1">
          <div className="pt-4 pb-16">
            {/* Search + Sort tabs */}
            <div className="mb-8">
              <ProjectsTopControls
                currentSearch={resolvedSearchParams.search}
                currentCategory={resolvedSearchParams.category}
                currentStatus={resolvedSearchParams.status}
              />
            </div>

            {/* Projects Grid */}
            {projects.length > 0 ? (
              <div className="mb-12 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
                {projects.map((project: any) => (
                  <ProjectCard key={project.documentId} project={project} />
                ))}
              </div>
            ) : (
              <div className="py-16 text-center">
                <div className="mb-4 text-gray-400">
                  <svg
                    className="mx-auto h-16 w-16"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <h3 className="mb-2 text-lg font-medium text-gray-900">
                  No projects found
                </h3>
                <p className="text-gray-600">
                  Try adjusting your search criteria or browse all projects.
                </p>
              </div>
            )}

            {/* Results Count bottom */}
            <div className="mt-4 text-center text-sm text-gray-500">
              {pagination?.total ? (
                <>
                  Showing {projects.length} of {pagination.total} projects
                </>
              ) : (
                <>No projects found</>
              )}
            </div>

            {/* Pagination */}
            {pagination && pagination.pageCount > 1 && (
              <div className="flex justify-center space-x-2">
                {Array.from(
                  { length: pagination.pageCount },
                  (_, i) => i + 1
                ).map((page) => (
                  <a
                    key={page}
                    href={`?${new URLSearchParams({
                      ...resolvedSearchParams,
                      page: page.toString(),
                    }).toString()}`}
                    className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                      page === pagination.page
                        ? "bg-blue-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {page}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* end main content */}
      </div>
    </Container>
  )
}
