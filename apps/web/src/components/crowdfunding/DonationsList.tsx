"use client"

import { useEffect, useState } from "react"
import { formatDistanceToNow } from "date-fns"
import { Heart, MessageSquare, User } from "lucide-react"

import { PublicStrapiClient } from "@/lib/strapi-api"
import { formatCurrency } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

interface Donation {
  id: number
  attributes: {
    Amount: number
    Currency: string
    IsAnonymous: boolean
    GiverName?: string
    Message?: string
    createdAt: string
    Giver?: {
      data?: {
        id: number
        attributes: {
          username: string
          email: string
          avatar?: {
            data?: {
              attributes: {
                url: string
              }
            }
          }
        }
      }
    }
  }
}

interface DonationsListProps {
  projectId: string
  limit?: number
}

export default function DonationsList({
  projectId,
  limit = 10,
}: DonationsListProps) {
  const [donations, setDonations] = useState<Donation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchDonations()
  }, [projectId])

  const fetchDonations = async () => {
    try {
      setIsLoading(true)
      const response = await PublicStrapiClient.fetchAPI(
        `/donations?filters[Project][id][$eq]=${projectId}&filters[PaymentStatus][$eq]=completed&populate[Giver][populate]=avatar&sort=createdAt:desc&pagination[limit]=${limit}`
      )

      if (response.data) {
        setDonations(response.data)
      }
    } catch (err) {
      console.error("Failed to fetch donations:", err)
      setError("Failed to load donations")
    } finally {
      setIsLoading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="text-muted-foreground p-6 text-center">
          {error}
        </CardContent>
      </Card>
    )
  }

  if (donations.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Heart className="text-muted-foreground/50 mx-auto mb-3 h-12 w-12" />
          <p className="text-muted-foreground">
            No donations yet. Be the first to support this project!
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {donations.map((donation) => {
        const isAnonymous = donation.attributes.IsAnonymous
        const giverName = isAnonymous
          ? "Anonymous"
          : donation.attributes.GiverName ||
            donation.attributes.Giver?.data?.attributes.username ||
            "Supporter"
        const avatarUrl =
          !isAnonymous &&
          donation.attributes.Giver?.data?.attributes.avatar?.data?.attributes
            .url

        return (
          <Card key={donation.id} className="overflow-hidden">
            <CardContent className="p-4">
              <div className="flex items-start space-x-3">
                <Avatar className="h-10 w-10">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={giverName} />}
                  <AvatarFallback>
                    {isAnonymous ? (
                      <User className="h-5 w-5" />
                    ) : (
                      giverName.charAt(0).toUpperCase()
                    )}
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{giverName}</p>
                      <p className="text-muted-foreground text-sm">
                        Donated{" "}
                        {formatCurrency(
                          donation.attributes.Amount,
                          donation.attributes.Currency
                        )}
                      </p>
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {formatDistanceToNow(
                        new Date(donation.attributes.createdAt),
                        { addSuffix: true }
                      )}
                    </p>
                  </div>

                  {donation.attributes.Message && (
                    <div className="mt-2 flex items-start space-x-2">
                      <MessageSquare className="text-muted-foreground mt-0.5 h-4 w-4" />
                      <p className="text-muted-foreground text-sm italic">
                        &ldquo;{donation.attributes.Message}&rdquo;
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
