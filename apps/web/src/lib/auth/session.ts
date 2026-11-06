import "server-only"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

import { cookieName, SESSION_ACCESS } from "./cookies"
import { userFromAccessToken, type SessionUser } from "./token"

export interface Session {
  user: SessionUser
  accessToken: string
}

async function currentHostname(): Promise<string> {
  const host = (await headers()).get("host") ?? "localhost"
  return host.replace(/:\d+$/, "")
}

/** The signed-in user, or null. proxy.ts keeps the access token fresh. */
export async function getSession(): Promise<Session | null> {
  const hostname = await currentHostname()
  const accessToken = (await cookies()).get(cookieName(SESSION_ACCESS, hostname))?.value
  const user = userFromAccessToken(accessToken)
  return user && accessToken ? { user, accessToken } : null
}

/** Like getSession, but sends anonymous visitors to login and back here. */
export async function requireSession(returnPath: string): Promise<Session> {
  const session = await getSession()
  if (!session) redirect(`/auth/login?return_path=${encodeURIComponent(returnPath)}`)
  return session
}
