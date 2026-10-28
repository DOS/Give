import { fetchFeaturedProjects } from "@/lib/strapi-api/content/project"
import { Container } from "@/components/catalyst/container"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"

interface FeaturesSectionProps {
  data?: {
    title?: string
    subtitle?: string
    buttonText?: string
    buttonLink?: string
  }
}

export default function FeaturedProjects({ data }: FeaturesSectionProps) {
  const {
    title = "Everything you need to succeed",
    subtitle = "Features",
    buttonText = "Get started today",
    buttonLink = "/start",
  } = data || {}

  return (
    <section className="py-24 sm:py-32">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 text-sm font-medium text-blue-600">{subtitle}</p>
          <h2 className="mb-16 text-3xl font-medium tracking-tight text-gray-950 sm:text-4xl">
            {title}
          </h2>
        </div>

        {/* Bento Grid Layout - Radiant Style */}
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:grid-rows-2">
            {/* Large Feature Card */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-50 to-indigo-100 p-8 lg:col-span-2">
              <div className="relative z-10">
                <h3 className="mb-4 text-xl font-semibold text-gray-950">
                  Smart Project Analytics
                </h3>
                <p className="mb-6 max-w-lg text-gray-600">
                  Track your project&apos;s performance with real-time analytics
                  and insights that help you make data-driven decisions.
                </p>
              </div>

              {/* Mock Analytics Chart */}
              <div className="relative mt-8">
                <div className="rounded-xl bg-white/80 p-6 shadow-sm">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-600">
                      Funding Progress
                    </span>
                    <span className="text-sm text-gray-500">Last 30 days</span>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Goal</span>
                      <span className="text-sm font-semibold">$50,000</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-gray-200">
                      <div
                        className="h-2 rounded-full bg-blue-600"
                        style={{ width: "75%" }}
                      ></div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Raised</span>
                      <span className="text-sm font-semibold text-blue-600">
                        $37,500
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Community Feature */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-purple-50 to-pink-100 p-8">
              <h3 className="mb-4 text-xl font-semibold text-gray-950">
                Global Community
              </h3>
              <p className="mb-6 text-gray-600">
                Connect with creators and backers from around the world.
              </p>

              {/* Mock User Avatars */}
              <div className="flex -space-x-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-purple-600 text-sm font-semibold text-white ring-2 ring-white"
                  >
                    {String.fromCharCode(64 + i)}
                  </div>
                ))}
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-sm font-semibold text-gray-600 ring-2 ring-white">
                  +12
                </div>
              </div>
            </div>

            {/* Security Feature */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-green-50 to-emerald-100 p-8">
              <h3 className="mb-4 text-xl font-semibold text-gray-950">
                Secure Payments
              </h3>
              <p className="mb-6 text-gray-600">
                Bank-level security for all transactions and data.
              </p>

              {/* Security Icons */}
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-green-600">
                  <svg
                    className="h-6 w-6 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-950">
                    SSL Encrypted
                  </div>
                  <div className="text-xs text-gray-600">
                    256-bit encryption
                  </div>
                </div>
              </div>
            </div>

            {/* Mobile App Feature */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-50 to-red-100 p-8 lg:col-span-2">
              <div className="relative z-10">
                <h3 className="mb-4 text-xl font-semibold text-gray-950">
                  Mobile-First Experience
                </h3>
                <p className="mb-6 max-w-lg text-gray-600">
                  Manage your projects on the go with our intuitive mobile app.
                  Available on iOS and Android.
                </p>

                <div className="flex gap-4">
                  <Button
                    variant="outline"
                    className="bg-white/80 hover:bg-white"
                  >
                    <svg
                      className="mr-2 h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
                    </svg>
                    App Store
                  </Button>
                  <Button
                    variant="outline"
                    className="bg-white/80 hover:bg-white"
                  >
                    <svg
                      className="mr-2 h-5 w-5"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M3,20.5V3.5C3,2.91 3.34,2.39 3.84,2.15L13.69,12L3.84,21.85C3.34,21.6 3,21.09 3,20.5M16.81,15.12L6.05,21.34L14.54,12.85L16.81,15.12M20.16,10.81C20.5,11.08 20.75,11.5 20.75,12C20.75,12.5 20.53,12.9 20.18,13.18L17.89,14.5L15.39,12L17.89,9.5L20.16,10.81M6.05,2.66L16.81,8.88L14.54,11.15L6.05,2.66Z" />
                    </svg>
                    Google Play
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* CTA Button */}
          <div className="mt-16 text-center">
            <Button
              asChild
              className="rounded-lg bg-blue-600 px-8 py-3 font-semibold text-white shadow-sm transition-colors duration-200 hover:bg-blue-700"
            >
              <a href={buttonLink}>{buttonText}</a>
            </Button>
          </div>
        </div>
      </Container>
    </section>
  )
}
