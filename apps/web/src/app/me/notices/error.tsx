"use client"

import { MeError } from "../_components/MeError"

export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return <MeError retry={retry} />
}
