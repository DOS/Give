import { EmbedNotFoundCard } from "@/components/EmbedNotFoundCard"
import { siteOrigin } from "@/lib/auth/origin"

export default function EmbedNotFound() {
  const origin = siteOrigin()
  return <EmbedNotFoundCard campaignsUrl={origin ? `${origin}/campaigns` : "/campaigns"} />
}
