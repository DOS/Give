"use client"

import {
  Bell,
  CheckCircle,
  Clock,
  FileText,
  Gift,
  Image as ImageIcon,
  MessageCircle,
  Play,
  Video,
} from "lucide-react"

import { ImageWithFallback } from "@/components/elementary/ImageWithFallback"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export interface ProjectDetailContentProps {
  project: {
    id: string
    Title: string
    Description?: string
    LongDescription?: string
    Image?: {
      url: string
      alternativeText?: string
    }
    Images?: Array<{
      url: string
      alternativeText?: string
      width?: number
      height?: number
    }>
    Category?: string
    CreatedBy?: string
    CreatedAt?: string
    FundingGoal?: number
    CurrentFunding?: number
    BackersCount?: number
    DaysLeft?: number
    Slug?: string
    Rewards?: Array<{
      id: number
      Title: string
      Description: string
      Amount: number
      Currency: string
      EstimatedDelivery?: string
      LimitedQuantity?: number
      ClaimedQuantity: number
      IsActive: boolean
    }>
  }
}

export function ProjectDetailContent({ project }: ProjectDetailContentProps) {
  // Mock data - in real app this would come from API
  const projectStory = `
    ${project.LongDescription || project.Description || "This is an innovative project that aims to revolutionize the way we think about crowdfunding. Our team has been working tirelessly to bring this vision to life."}

    ## Why This Project Matters

    This project addresses a critical need in our community. We've identified key problems that need solving, and we believe our approach is both innovative and practical.

    ## What Makes Us Different

    Our unique approach combines cutting-edge technology with user-centered design. We're not just creating another product – we're building a solution that truly makes a difference.

    ## The Team Behind This

    Our team brings together experts from various fields, each contributing their unique expertise to make this project a success.

    ## How We'll Use Your Support

    Every dollar you contribute goes directly toward making this project a reality. We've carefully planned our budget to ensure maximum impact.
  `

  const updates = [
    {
      id: "1",
      title: "Project Launch - We're Live!",
      date: "2 days ago",
      content:
        "We're excited to announce that our project is now live on the platform! Thank you for all the early support.",
      type: "announcement",
      commentsCount: 24,
    },
    {
      id: "2",
      title: "Behind the Scenes Video",
      date: "1 week ago",
      content:
        "Check out this exclusive behind-the-scenes look at how we're creating this project.",
      type: "video",
      commentsCount: 12,
    },
    {
      id: "3",
      title: "Prototype Testing Complete",
      date: "2 weeks ago",
      content:
        "We've completed extensive testing of our prototype and the results are fantastic!",
      type: "milestone",
      commentsCount: 8,
    },
  ]

  const faqs = [
    {
      question: "When will this project be completed?",
      answer:
        "We expect to complete the project by March 2025, with regular updates throughout the development process.",
    },
    {
      question: "What happens if you don't reach your funding goal?",
      answer:
        "If we don't reach our goal, all contributions will be refunded. However, we're confident in our community support!",
    },
    {
      question: "Can I change or cancel my pledge?",
      answer:
        "Yes, you can modify or cancel your pledge anytime during the campaign period.",
    },
    {
      question: "Do you ship internationally?",
      answer:
        "Yes, we ship worldwide! Shipping costs will be calculated based on your location.",
    },
  ]

  const getUpdateIcon = (type: string) => {
    switch (type) {
      case "video":
        return <Video className="h-4 w-4" />
      case "milestone":
        return <CheckCircle className="h-4 w-4" />
      case "image":
        return <ImageIcon className="h-4 w-4" />
      default:
        return <Bell className="h-4 w-4" />
    }
  }

  const getUpdateBadge = (type: string) => {
    switch (type) {
      case "video":
        return (
          <Badge variant="outline" className="border-blue-200 text-blue-600">
            Video
          </Badge>
        )
      case "milestone":
        return (
          <Badge variant="outline" className="border-green-200 text-green-600">
            Milestone
          </Badge>
        )
      case "image":
        return (
          <Badge
            variant="outline"
            className="border-purple-200 text-purple-600"
          >
            Gallery
          </Badge>
        )
      default:
        return <Badge variant="outline">Update</Badge>
    }
  }

  return (
    <div className="space-y-6">
      {/* Project Navigation/Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <span>Projects</span>
        <span>/</span>
        {project.Category && (
          <>
            <span>{project.Category}</span>
            <span>/</span>
          </>
        )}
        <span className="text-gray-900">{project.Title}</span>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="story" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="story" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Story
          </TabsTrigger>
          <TabsTrigger value="updates" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Updates
          </TabsTrigger>
          <TabsTrigger value="comments" className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4" />
            Comments
          </TabsTrigger>
          <TabsTrigger value="faq" className="flex items-center gap-2">
            <Gift className="h-4 w-4" />
            FAQ
          </TabsTrigger>
        </TabsList>

        {/* Story Tab */}
        <TabsContent value="story" className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              {/* Project Video/Image */}
              <div className="relative mb-6 aspect-video overflow-hidden rounded-lg bg-gray-100">
                <ImageWithFallback
                  src={project.Image?.url || "/placeholder-project.svg"}
                  alt={
                    project.Image?.alternativeText ||
                    project.Title ||
                    "Project image"
                  }
                  width={800}
                  height={450}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <Button size="lg" className="h-16 w-16 rounded-full">
                    <Play className="h-6 w-6" />
                  </Button>
                </div>
              </div>

              {/* Story Content */}
              <div className="prose prose-gray max-w-none">
                <div className="leading-relaxed whitespace-pre-wrap text-gray-700">
                  {projectStory}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Risks and Challenges */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Risks & Challenges
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-700">
                As with any innovative project, we face certain challenges.
                We&apos;ve identified potential risks and have contingency plans
                in place. Our experienced team and thorough planning help
                mitigate these risks, but we believe in transparency with our
                backers.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Updates Tab */}
        <TabsContent value="updates" className="space-y-4">
          {updates.map((update) => (
            <Card key={update.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getUpdateIcon(update.type)}
                    <div>
                      <CardTitle className="text-lg">{update.title}</CardTitle>
                      <p className="text-sm text-gray-600">{update.date}</p>
                    </div>
                  </div>
                  {getUpdateBadge(update.type)}
                </div>
              </CardHeader>
              <CardContent>
                <p className="mb-4 text-gray-700">{update.content}</p>
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <MessageCircle className="h-4 w-4" />
                    {update.commentsCount} comments
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Comments Tab */}
        <TabsContent value="comments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Project Comments</CardTitle>
              <p className="text-sm text-gray-600">
                Join the conversation and connect with other backers
              </p>
            </CardHeader>
            <CardContent>
              <div className="py-8 text-center text-gray-500">
                <MessageCircle className="mx-auto mb-4 h-12 w-12 text-gray-300" />
                <p>No comments yet. Be the first to start the conversation!</p>
                <Button className="mt-4">Write a comment</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* FAQ Tab */}
        <TabsContent value="faq" className="space-y-4">
          {faqs.map((faq, index) => (
            <Card key={index}>
              <CardHeader>
                <CardTitle className="text-lg">{faq.question}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-700">{faq.answer}</p>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}
