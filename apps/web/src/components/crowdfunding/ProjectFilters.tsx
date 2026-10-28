"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export interface ProjectFiltersProps {
  currentType?: string
  currentCategory?: string
  currentStatus?: string
  currentSearch?: string
}

const types = [
  { value: "give", label: "❤️ Give", description: "Support charitable causes" },
  { value: "back", label: "🚀 Back", description: "Fund creative projects" },
]

const categories = [
  { value: "technology_innovation", label: "Technology" },
  { value: "environment_sustainability", label: "Environment" },
  { value: "health_medical", label: "Health" },
  { value: "arts_culture", label: "Arts & Culture" },
  { value: "community", label: "Community" },
  { value: "education", label: "Education" },
  { value: "business", label: "Business" },
]

const statuses = [
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
  { value: "completed", label: "Completed" },
]

export function ProjectFilters({
  currentType,
  currentCategory,
  currentStatus,
  currentSearch,
}: ProjectFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchInput, setSearchInput] = useState(currentSearch || "")

  const updateFilters = (key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString())

    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }

    // Reset to page 1 when filtering
    params.delete("page")

    router.push(`?${params.toString()}`)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    updateFilters("search", searchInput || null)
  }

  const clearAllFilters = () => {
    setSearchInput("")
    router.push("/projects")
  }

  const hasActiveFilters =
    currentType || currentCategory || currentStatus || currentSearch

  return (
    <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
      {/* Search */}
      <form onSubmit={handleSearch} className="mb-6">
        <div className="relative">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <svg
              className="h-5 w-5 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search projects..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="block w-full rounded-md border border-gray-300 bg-white py-3 pr-20 pl-10 leading-5 placeholder-gray-500 focus:border-transparent focus:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          />
          <div className="absolute inset-y-0 right-0 flex items-center pr-2">
            <Button
              type="submit"
              size="sm"
              className="bg-blue-600 hover:bg-blue-700"
            >
              Search
            </Button>
          </div>
        </div>
      </form>

      {/* Type Filters */}
      <div className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-gray-900">Project Type</h3>
        <div className="flex flex-col gap-2">
          <Button
            variant={!currentType ? "default" : "outline"}
            size="sm"
            onClick={() => updateFilters("type", null)}
            className="justify-start text-xs"
          >
            All Types
          </Button>
          {types.map((type) => (
            <Button
              key={type.value}
              variant={currentType === type.value ? "default" : "outline"}
              size="sm"
              onClick={() => updateFilters("type", type.value)}
              className="justify-start text-xs"
            >
              <span className="mr-2">{type.label}</span>
              <span className="font-normal text-gray-500">
                {type.description}
              </span>
            </Button>
          ))}
        </div>
      </div>

      {/* Category Filters */}
      <div className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-gray-900">Categories</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={!currentCategory ? "default" : "outline"}
            size="sm"
            onClick={() => updateFilters("category", null)}
            className="text-xs"
          >
            All Categories
          </Button>
          {categories.map((category) => (
            <Button
              key={category.value}
              variant={
                currentCategory === category.value ? "default" : "outline"
              }
              size="sm"
              onClick={() => updateFilters("category", category.value)}
              className="text-xs"
            >
              {category.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Status Filters */}
      <div className="mb-6">
        <h3 className="mb-3 text-sm font-medium text-gray-900">Status</h3>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={!currentStatus ? "default" : "outline"}
            size="sm"
            onClick={() => updateFilters("status", null)}
            className="text-xs"
          >
            All Status
          </Button>
          {statuses.map((status) => (
            <Button
              key={status.value}
              variant={currentStatus === status.value ? "default" : "outline"}
              size="sm"
              onClick={() => updateFilters("status", status.value)}
              className="text-xs"
            >
              {status.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Active Filters & Clear */}
      {hasActiveFilters && (
        <div className="flex items-center justify-between border-t border-gray-200 pt-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Active filters:</span>
            {currentType && (
              <Badge variant="secondary" className="text-xs">
                {types.find((t) => t.value === currentType)?.label}
                <button
                  onClick={() => updateFilters("type", null)}
                  className="ml-1 hover:text-red-600"
                >
                  ×
                </button>
              </Badge>
            )}
            {currentCategory && (
              <Badge variant="secondary" className="text-xs">
                {categories.find((c) => c.value === currentCategory)?.label}
                <button
                  onClick={() => updateFilters("category", null)}
                  className="ml-1 hover:text-red-600"
                >
                  ×
                </button>
              </Badge>
            )}
            {currentStatus && (
              <Badge variant="secondary" className="text-xs">
                {statuses.find((s) => s.value === currentStatus)?.label}
                <button
                  onClick={() => updateFilters("status", null)}
                  className="ml-1 hover:text-red-600"
                >
                  ×
                </button>
              </Badge>
            )}
            {currentSearch && (
              <Badge variant="secondary" className="text-xs">
                &ldquo;{currentSearch}&rdquo;
                <button
                  onClick={() => updateFilters("search", null)}
                  className="ml-1 hover:text-red-600"
                >
                  ×
                </button>
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="text-xs text-gray-600 hover:text-gray-900"
          >
            Clear all
          </Button>
        </div>
      )}
    </div>
  )
}
