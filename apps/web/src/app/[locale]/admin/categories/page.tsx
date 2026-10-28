import { getCategories } from "@/lib/strapi-api/content/category"
import { Card } from "@/components/tailwind-plus/Card"

export default async function CategoriesPage() {
  const giveCategories = await getCategories("give")
  const backCategories = await getCategories("back")

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold">Categories Management</h1>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Give Categories */}
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
            <span className="text-2xl">❤️</span>
            Give Categories (Charitable)
          </h2>
          <div className="space-y-3">
            {giveCategories.length === 0 ? (
              <Card className="p-4">
                <p className="text-gray-500 italic">
                  No Give categories found. Please run the seed script.
                </p>
              </Card>
            ) : (
              giveCategories.map((category) => (
                <Card
                  key={category.id}
                  className="p-4 transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{category.Icon}</span>
                      <div>
                        <h3 className="text-lg font-semibold">
                          {category.Name}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {category.Description}
                        </p>
                        <div className="mt-2 flex items-center gap-4">
                          <span className="text-xs text-gray-500">
                            Slug: {category.Slug}
                          </span>
                          {category.Color && (
                            <span
                              className="h-4 w-4 rounded-full border border-gray-300"
                              style={{ backgroundColor: category.Color }}
                              title={category.Color}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="text-sm text-gray-400">
                      #{category.SortOrder}
                    </span>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>

        {/* Back Categories */}
        <div>
          <h2 className="mb-4 flex items-center gap-2 text-2xl font-semibold">
            <span className="text-2xl">🚀</span>
            Back Categories (Creative)
          </h2>
          <div className="space-y-3">
            {backCategories.length === 0 ? (
              <Card className="p-4">
                <p className="text-gray-500 italic">
                  No Back categories found. Please run the seed script.
                </p>
              </Card>
            ) : (
              backCategories.map((category) => (
                <Card
                  key={category.id}
                  className="p-4 transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{category.Icon}</span>
                      <div>
                        <h3 className="text-lg font-semibold">
                          {category.Name}
                        </h3>
                        <p className="text-sm text-gray-600">
                          {category.Description}
                        </p>
                        <div className="mt-2 flex items-center gap-4">
                          <span className="text-xs text-gray-500">
                            Slug: {category.Slug}
                          </span>
                          {category.Color && (
                            <span
                              className="h-4 w-4 rounded-full border border-gray-300"
                              style={{ backgroundColor: category.Color }}
                              title={category.Color}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                    <span className="text-sm text-gray-400">
                      #{category.SortOrder}
                    </span>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-12 rounded-lg bg-gray-50 p-6">
        <h3 className="mb-2 font-semibold">How to seed categories:</h3>
        <ol className="list-inside list-decimal space-y-1 text-sm text-gray-700">
          <li>Go to Strapi Admin → Settings → API Tokens</li>
          <li>Create a new API token with full access</li>
          <li>
            Set environment variable:{" "}
            <code className="rounded bg-gray-200 px-2 py-1">
              $env:STRAPI_API_TOKEN=&quot;your-token&quot;
            </code>
          </li>
          <li>
            Run:{" "}
            <code className="rounded bg-gray-200 px-2 py-1">
              .\scripts\seed-categories.ps1
            </code>
          </li>
        </ol>
      </div>
    </div>
  )
}
