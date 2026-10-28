"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  PhotoIcon,
  TagIcon,
} from "@heroicons/react/24/outline"

import { cn } from "@/lib/utils"
import { Container } from "@/components/catalyst/container"
import { Input as CatalystInput } from "@/components/catalyst/input"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input as ShadcnInput } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

interface Reward {
  title: string
  description: string
  amount: string
  limit?: string
  estimatedDelivery?: Date
}

const tabOrder = ["basics", "funding", "rewards", "media"]

// Categories for Give (charitable/donation projects)
const giveCategories = [
  { value: "disaster_relief", label: "Disaster Relief" },
  { value: "poverty_alleviation", label: "Poverty Alleviation" },
  { value: "healthcare", label: "Healthcare" },
  { value: "education_charity", label: "Education" },
  { value: "environment_conservation", label: "Environment" },
  { value: "animal_welfare", label: "Animal Welfare" },
  { value: "community_development", label: "Community Development" },
  { value: "humanitarian_aid", label: "Humanitarian Aid" },
]

// Categories for Back (creative/reward-based projects)
const backCategories = [
  { value: "technology", label: "Technology" },
  { value: "arts", label: "Arts" },
  { value: "film_video", label: "Film & Video" },
  { value: "games", label: "Games" },
  { value: "music", label: "Music" },
  { value: "publishing", label: "Publishing" },
  { value: "food_craft", label: "Food & Craft" },
  { value: "design_fashion", label: "Design & Fashion" },
]

export default function CreateProjectForm() {
  const router = useRouter()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState("basics")

  // Form states
  const [projectType, setProjectType] = useState<"give" | "back">("give")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [shortDescription, setShortDescription] = useState("")
  const [category, setCategory] = useState("")
  const [fundingGoal, setFundingGoal] = useState("")
  const [currency, setCurrency] = useState("USD")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [media, setMedia] = useState<File[]>([])
  const [videoUrl, setVideoUrl] = useState("")
  const [rewards, setRewards] = useState<Reward[]>([])
  const [tags, setTags] = useState<string[]>([])

  // Get categories based on project type
  const categories = projectType === "give" ? giveCategories : backCategories

  // Reset category when project type changes
  const handleProjectTypeChange = (value: "give" | "back") => {
    setProjectType(value)
    setCategory("") // Reset category when type changes
  }

  const currentTabIndex = tabOrder.indexOf(activeTab)
  const canGoNext = currentTabIndex < tabOrder.length - 1
  const canGoPrevious = currentTabIndex > 0

  const goToNextTab = () => {
    if (canGoNext) {
      setActiveTab(tabOrder[currentTabIndex + 1])
    }
  }

  const goToPreviousTab = () => {
    if (canGoPrevious) {
      setActiveTab(tabOrder[currentTabIndex - 1])
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // TODO: Implement API call to create project
      console.log("Creating project:", {
        projectType,
        title,
        description,
        shortDescription,
        category,
        fundingGoal,
        currency,
        startDate,
        endDate,
        media,
        videoUrl,
        rewards,
        tags,
      })

      // Redirect to project page after creation
      router.push("/projects")
    } catch (error) {
      console.error("Error creating project:", error)
    } finally {
      setIsSubmitting(false)
    }
  }

  const addReward = () => {
    setRewards([
      ...rewards,
      {
        title: "",
        description: "",
        amount: "",
        limit: "",
        estimatedDelivery: undefined,
      },
    ])
  }

  const updateReward = (index: number, field: keyof Reward, value: any) => {
    const newRewards = [...rewards]
    newRewards[index] = { ...newRewards[index], [field]: value }
    setRewards(newRewards)
  }

  const removeReward = (index: number) => {
    setRewards(rewards.filter((_, i) => i !== index))
  }

  // Calculate project duration
  const calculateDuration = () => {
    if (startDate && endDate) {
      const start = new Date(startDate)
      const end = new Date(endDate)
      const diffTime = Math.abs(end.getTime() - start.getTime())
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      return `${diffDays} days`
    }
    return "Select start and end dates"
  }

  // Get min date for inputs
  const today = new Date().toISOString().split("T")[0]
  const tomorrow = new Date(new Date().setDate(new Date().getDate() + 1))
    .toISOString()
    .split("T")[0]

  return (
    <Container className="py-8">
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight">
            Create Your Project
          </h1>
          <p className="text-muted-foreground mt-2">
            Share your vision and bring your project to life with the support of
            our community
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basics">Basics</TabsTrigger>
              <TabsTrigger value="funding">Funding</TabsTrigger>
              <TabsTrigger value="rewards">Rewards</TabsTrigger>
              <TabsTrigger value="media">Media</TabsTrigger>
            </TabsList>

            <TabsContent value="basics" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Project Details</CardTitle>
                  <CardDescription>
                    Tell us about your project and what you&apos;re trying to
                    achieve
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Project Type *</Label>
                    <RadioGroup
                      value={projectType}
                      onValueChange={(value: "give" | "back") =>
                        handleProjectTypeChange(value)
                      }
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="give" id="give" />
                        <Label
                          htmlFor="give"
                          className="cursor-pointer font-normal"
                        >
                          Give - Donation-based project (no rewards required)
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="back" id="back" />
                        <Label
                          htmlFor="back"
                          className="cursor-pointer font-normal"
                        >
                          Back - Reward-based project (backers receive rewards)
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="title">Project Title *</Label>
                    <ShadcnInput
                      id="title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Give your project a clear, attention-grabbing title"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="shortDescription">
                      Short Description *
                    </Label>
                    <ShadcnInput
                      id="shortDescription"
                      value={shortDescription}
                      onChange={(e) => setShortDescription(e.target.value)}
                      placeholder="A brief tagline for your project (max 160 characters)"
                      maxLength={160}
                      required
                    />
                    <p className="text-muted-foreground text-sm">
                      {shortDescription.length}/160 characters
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">Full Description *</Label>
                    <Textarea
                      id="description"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe your project in detail. What problem are you solving? Why should people support you?"
                      rows={8}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="category">Category *</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger id="category">
                        <SelectValue placeholder="Select a category" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((category) => (
                          <SelectItem
                            key={category.value}
                            value={category.value}
                          >
                            {category.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tags">Tags</Label>
                    <ShadcnInput
                      id="tags"
                      placeholder="Add tags separated by commas (e.g., innovation, sustainability, community)"
                      onChange={(e) =>
                        setTags(
                          e.target.value
                            .split(",")
                            .map((tag) => tag.trim())
                            .filter(Boolean)
                        )
                      }
                    />
                    <div className="mt-2 flex flex-wrap gap-2">
                      {tags.map((tag, index) => (
                        <span
                          key={index}
                          className="bg-primary/10 text-primary inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium"
                        >
                          <TagIcon className="h-3 w-3" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Navigation buttons for Basics tab */}
              <div className="flex justify-between">
                <div></div>
                <Button
                  type="button"
                  onClick={goToNextTab}
                  disabled={
                    !title || !shortDescription || !description || !category
                  }
                >
                  Next
                  <ChevronRightIcon className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="funding" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Funding Details</CardTitle>
                  <CardDescription>
                    Set your funding goal and project duration
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fundingGoal">Funding Goal *</Label>
                      <ShadcnInput
                        id="fundingGoal"
                        type="number"
                        value={fundingGoal}
                        onChange={(e) => setFundingGoal(e.target.value)}
                        placeholder="0"
                        min="1"
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="currency">Currency *</Label>
                      <Select value={currency} onValueChange={setCurrency}>
                        <SelectTrigger id="currency">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="USD">USD - US Dollar</SelectItem>
                          <SelectItem value="EUR">EUR - Euro</SelectItem>
                          <SelectItem value="GBP">
                            GBP - British Pound
                          </SelectItem>
                          <SelectItem value="VND">
                            VND - Vietnamese Dong
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="startDate">Start Date *</Label>
                      <CatalystInput
                        id="startDate"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        min={today}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="endDate">End Date *</Label>
                      <CatalystInput
                        id="endDate"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        min={startDate || tomorrow}
                        required
                      />
                    </div>
                  </div>

                  <div className="bg-muted rounded-lg p-4">
                    <h4 className="mb-2 font-medium">Project Duration</h4>
                    <p className="text-muted-foreground text-sm">
                      {calculateDuration()}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Navigation buttons for Funding tab */}
              <div className="flex justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={goToPreviousTab}
                >
                  <ChevronLeftIcon className="mr-2 h-4 w-4" />
                  Previous
                </Button>
                <Button
                  type="button"
                  onClick={goToNextTab}
                  disabled={!fundingGoal || !startDate || !endDate}
                >
                  Next
                  <ChevronRightIcon className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="rewards" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Rewards</CardTitle>
                  <CardDescription>
                    {projectType === "give"
                      ? "Optional: You can add rewards for your donation-based project"
                      : "Create rewards to incentivize backers to support your project"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {rewards.map((reward, index) => (
                    <Card key={index}>
                      <CardContent className="space-y-4 pt-6">
                        <div className="flex items-start justify-between">
                          <h4 className="font-medium">Reward {index + 1}</h4>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeReward(index)}
                          >
                            Remove
                          </Button>
                        </div>

                        <div className="space-y-2">
                          <Label>Title</Label>
                          <ShadcnInput
                            value={reward.title}
                            onChange={(e) =>
                              updateReward(index, "title", e.target.value)
                            }
                            placeholder="e.g., Early Bird Special"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Description</Label>
                          <Textarea
                            value={reward.description}
                            onChange={(e) =>
                              updateReward(index, "description", e.target.value)
                            }
                            placeholder="Describe what backers will receive"
                            rows={3}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Minimum Amount ({currency})</Label>
                            <ShadcnInput
                              type="number"
                              value={reward.amount}
                              onChange={(e) =>
                                updateReward(index, "amount", e.target.value)
                              }
                              placeholder="0"
                              min="1"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Limit (optional)</Label>
                            <ShadcnInput
                              type="number"
                              value={reward.limit}
                              onChange={(e) =>
                                updateReward(index, "limit", e.target.value)
                              }
                              placeholder="Unlimited"
                              min="1"
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}

                  <Button
                    type="button"
                    variant="outline"
                    onClick={addReward}
                    className="w-full"
                  >
                    Add Reward
                  </Button>

                  {projectType === "back" && rewards.length === 0 && (
                    <p className="text-destructive text-sm">
                      * Reward-based projects must have at least one reward
                    </p>
                  )}
                </CardContent>
              </Card>

              {/* Navigation buttons for Rewards tab */}
              <div className="flex justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={goToPreviousTab}
                >
                  <ChevronLeftIcon className="mr-2 h-4 w-4" />
                  Previous
                </Button>
                <Button
                  type="button"
                  onClick={goToNextTab}
                  disabled={projectType === "back" && rewards.length === 0}
                >
                  Next
                  <ChevronRightIcon className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="media" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Media</CardTitle>
                  <CardDescription>
                    Add images and videos to showcase your project
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="media">Project Images</Label>
                    <div className="rounded-lg border-2 border-dashed p-6 text-center">
                      <PhotoIcon className="text-muted-foreground mx-auto h-12 w-12" />
                      <div className="mt-4">
                        <label
                          htmlFor="media"
                          className="text-primary cursor-pointer text-sm font-medium hover:underline"
                        >
                          <span>Upload images</span>
                          <input
                            id="media"
                            type="file"
                            className="sr-only"
                            multiple
                            accept="image/*"
                            onChange={(e) => {
                              if (e.target.files) {
                                setMedia(Array.from(e.target.files))
                              }
                            }}
                          />
                        </label>
                        <p className="text-muted-foreground mt-1 text-xs">
                          PNG, JPG, GIF up to 10MB
                        </p>
                      </div>
                    </div>
                    {media.length > 0 && (
                      <div className="mt-4 grid grid-cols-3 gap-4">
                        {media.map((file, index) => (
                          <div key={index} className="relative">
                            <img
                              src={URL.createObjectURL(file)}
                              alt={`Upload ${index + 1}`}
                              className="h-24 w-full rounded-lg object-cover"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="videoUrl">Video URL (optional)</Label>
                    <ShadcnInput
                      id="videoUrl"
                      value={videoUrl}
                      onChange={(e) => setVideoUrl(e.target.value)}
                      placeholder="https://youtube.com/watch?v=..."
                    />
                    <p className="text-muted-foreground text-sm">
                      Add a YouTube or Vimeo link to showcase your project
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Navigation buttons for Media tab */}
              <div className="flex justify-between">
                <Button
                  type="button"
                  variant="outline"
                  onClick={goToPreviousTab}
                >
                  <ChevronLeftIcon className="mr-2 h-4 w-4" />
                  Previous
                </Button>
                <div className="flex gap-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => router.push("/projects")}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Creating..." : "Create Project"}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </form>
      </div>
    </Container>
  )
}
