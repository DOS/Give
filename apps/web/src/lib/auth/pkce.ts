import { createHash } from "node:crypto"

/** RFC 7636 S256 code challenge for a code_verifier. */
export function pkceChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url")
}
