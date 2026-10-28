"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import {
  Calendar,
  DollarSign,
  Download,
  Filter,
  Heart,
  RefreshCw,
  Search,
  TrendingUp,
  Users,
} from "lucide-react"

import { formatCurrency } from "@/lib/utils"
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
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "@/components/ui/use-toast"

interface Donation {
  id: string
  Amount: number
  Currency: string
  PaymentStatus: string
  PaymentMethod: string
  createdAt: string
  Project: {
    id: string
    Title: string
    Slug: string
  }
  Message?: string
}

interface FakeDonation {
  id: string
  amount: number
  currency: string
  donorName: string
  isAnonymous: boolean
  message?: string
  createdAt: Date
  projectType: "give" | "back"
}

interface DonationHistoryProps {
  projectId: number
  projectType?: "give" | "back"
  currentFunding?: number
  fundingGoal?: number
}

// Fake donor names for demo
const fakeNames = [
  "Nguyễn Văn A",
  "Trần Thị B",
  "Lê Văn C",
  "Phạm Thị D",
  "Hoàng Văn E",
  "Đặng Thị F",
  "Bùi Văn G",
  "Vũ Thị H",
  "Anonymous",
  "Anonymous",
  "Anonymous", // More anonymous donors
]

const fakeMessages = [
  "Chúc dự án thành công!",
  "Ủng hộ một chút, chúc may mắn!",
  "Great project, keep it up!",
  "Happy to support this cause",
  "Rất ý nghĩa, xin được đóng góp",
  "Supporting from Saigon!",
  "",
  "",
  "", // Some without messages
]

export default function DonationHistory({
  projectId,
  projectType = "give",
  currentFunding = 0,
  fundingGoal = 100000,
}: DonationHistoryProps) {
  const [donations, setDonations] = useState<FakeDonation[]>([])
  const [isGenerating, setIsGenerating] = useState(false)

  // Generate fake donations on mount
  useEffect(() => {
    generateFakeDonations()
  }, [projectId])

  const generateFakeDonations = () => {
    const count = Math.floor(Math.random() * 8) + 5 // 5-12 donations
    const fakeDonations: FakeDonation[] = []

    for (let i = 0; i < count; i++) {
      const isAnonymous = Math.random() > 0.7 // 30% anonymous
      const amount = Math.floor(Math.random() * 500) + 10 // $10-$510

      fakeDonations.push({
        id: `fake-${projectId}-${i}`,
        amount,
        currency: "USD",
        donorName: isAnonymous
          ? "Anonymous"
          : fakeNames[Math.floor(Math.random() * fakeNames.length)],
        isAnonymous,
        message:
          Math.random() > 0.5
            ? fakeMessages[Math.floor(Math.random() * fakeMessages.length)]
            : undefined,
        createdAt: new Date(
          Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000
        ), // Last 30 days
        projectType,
      })
    }

    // Sort by date descending
    fakeDonations.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    setDonations(fakeDonations)
  }

  // Simulate new donation coming in
  const simulateNewDonation = () => {
    setIsGenerating(true)
    setTimeout(() => {
      const isAnonymous = Math.random() > 0.7
      const amount = Math.floor(Math.random() * 200) + 20

      const newDonation: FakeDonation = {
        id: `fake-${projectId}-${Date.now()}`,
        amount,
        currency: "USD",
        donorName: isAnonymous
          ? "Anonymous"
          : fakeNames[Math.floor(Math.random() * fakeNames.length)],
        isAnonymous,
        message:
          Math.random() > 0.5
            ? fakeMessages[Math.floor(Math.random() * fakeMessages.length)]
            : undefined,
        createdAt: new Date(),
        projectType,
      }

      setDonations((prev) => [newDonation, ...prev])
      setIsGenerating(false)
    }, 1000)
  }

  const totalRaised =
    donations.reduce((sum, d) => sum + d.amount, 0) + currentFunding
  const backerCount = donations.length + Math.floor(currentFunding / 50) // Estimate previous backers

  const getTimeAgo = (date: Date) => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000)
    if (seconds < 60) return "just now"
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 30) return `${days}d ago`
    return date.toLocaleDateString()
  }

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Total Raised</p>
                <p className="text-xl font-bold">
                  {formatCurrency(totalRaised, "USD")}
                </p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">
                  {projectType === "give" ? "Donors" : "Backers"}
                </p>
                <p className="text-xl font-bold">{backerCount}</p>
              </div>
              <Users className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-sm">Funded</p>
                <p className="text-xl font-bold">
                  {Math.round((totalRaised / fundingGoal) * 100)}%
                </p>
              </div>
              <Heart className="h-8 w-8 text-pink-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Donations */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            Recent {projectType === "give" ? "Donations" : "Backers"}
          </CardTitle>
          <button
            onClick={simulateNewDonation}
            disabled={isGenerating}
            className="text-primary text-sm hover:underline disabled:opacity-50"
          >
            {isGenerating ? "Generating..." : "Simulate New"}
          </button>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {donations.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center">
                Be the first to{" "}
                {projectType === "give" ? "donate" : "back this project"}!
              </p>
            ) : (
              donations.slice(0, 10).map((donation) => (
                <div key={donation.id} className="flex items-start space-x-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>
                      {donation.isAnonymous
                        ? "?"
                        : donation.donorName.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{donation.donorName}</p>
                      <p className="text-muted-foreground text-sm">
                        {getTimeAgo(donation.createdAt)}
                      </p>
                    </div>
                    <p className="text-primary text-sm font-medium">
                      {formatCurrency(donation.amount, donation.currency)}
                    </p>
                    {donation.message && (
                      <p className="text-muted-foreground text-sm italic">
                        &ldquo;{donation.message}&rdquo;
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {donations.length > 10 && (
            <p className="text-muted-foreground mt-4 text-center text-sm">
              And {donations.length - 10} more{" "}
              {projectType === "give" ? "donations" : "backers"}...
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
