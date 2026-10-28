import { PrivateStrapiClient } from "@/lib/strapi-api"

import { StrapiResponse } from "../types"

export interface Category {
  id: number
  documentId: string
  Name: string
  Slug: string
  Description?: string
  Type: "give" | "back" | "both"
  Icon?: string
  Color?: string
  SortOrder: number
  IsActive: boolean
  Featured: boolean
}

export interface CategoryResponse {
  id: number
  documentId: string
  attributes: {
    Name: string
    Slug: string
    Description?: string
    Type: "give" | "back" | "both"
    Icon?: string
    Color?: string
    SortOrder: number
    IsActive: boolean
    Featured: boolean
    createdAt: string
    updatedAt: string
    publishedAt: string
  }
}

export async function getCategories(
  type?: "give" | "back"
): Promise<Category[]> {
  try {
    const filters: any = {
      IsActive: { $eq: true },
    }

    if (type) {
      // Get categories that match the type OR are marked as "both"
      filters.$or = [{ Type: { $eq: type } }, { Type: { $eq: "both" } }]
    }

    const response = await PrivateStrapiClient.fetchAPI<
      StrapiResponse<CategoryResponse[]>
    >("/categories", {
      params: {
        filters,
        sort: ["SortOrder:asc", "Name:asc"],
        pagination: {
          pageSize: 100,
        },
      },
    })

    if (!response.data) {
      return []
    }

    return response.data.map((item) => ({
      id: item.id,
      documentId: item.documentId,
      Name: item.attributes.Name,
      Slug: item.attributes.Slug,
      Description: item.attributes.Description,
      Type: item.attributes.Type,
      Icon: item.attributes.Icon,
      Color: item.attributes.Color,
      SortOrder: item.attributes.SortOrder,
      IsActive: item.attributes.IsActive,
      Featured: item.attributes.Featured,
    }))
  } catch (error) {
    console.error("Error fetching categories:", error)
    return []
  }
}

export async function getCategoryBySlug(
  slug: string
): Promise<Category | null> {
  try {
    const response = await PrivateStrapiClient.fetchAPI<
      StrapiResponse<CategoryResponse[]>
    >("/categories", {
      params: {
        filters: {
          Slug: { $eq: slug },
        },
      },
    })

    if (!response.data || response.data.length === 0) {
      return null
    }

    const item = response.data[0]
    return {
      id: item.id,
      documentId: item.documentId,
      Name: item.attributes.Name,
      Slug: item.attributes.Slug,
      Description: item.attributes.Description,
      Type: item.attributes.Type,
      Icon: item.attributes.Icon,
      Color: item.attributes.Color,
      SortOrder: item.attributes.SortOrder,
      IsActive: item.attributes.IsActive,
      Featured: item.attributes.Featured,
    }
  } catch (error) {
    console.error("Error fetching category by slug:", error)
    return null
  }
}
