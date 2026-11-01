import { existsSync, readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

/**
 * No module a client component can load may reach the service-role client or
 * the server-only code under src/server (money RPCs, channels, parsers).
 * `import "server-only"` already breaks the Next build when that happens;
 * this test says which import chain did it, and also catches a module that
 * reads SUPABASE_SERVICE_ROLE_KEY without that guard.
 */

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"]

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

function isClientEntry(source: string): boolean {
  // The directive must come first, before any import (comments aside).
  const code = source.replace(/^(\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "")
  return /^["']use client["']/.test(code)
}

/** Modules a file loads at run time: type-only imports and exports are erased. */
function runtimeImports(source: string): string[] {
  const specifiers: string[] = []
  // The clause between the keyword and "from" holds only names, braces, commas and "*".
  const statement = /^\s*(import|export)\s+(type\s+)?[\w$*{},\s]*?from\s+["']([^"']+)["']/gm
  for (const match of source.matchAll(statement)) if (!match[2]) specifiers.push(match[3])
  for (const match of source.matchAll(/^\s*import\s+["']([^"']+)["']/gm)) specifiers.push(match[1])
  for (const match of source.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) specifiers.push(match[1])
  return specifiers
}

function resolveImport(from: string, specifier: string): string | null {
  let base: string
  if (specifier.startsWith("@/")) base = join(SRC, specifier.slice(2))
  else if (specifier.startsWith(".")) base = resolve(dirname(from), specifier)
  else return null // a package
  for (const extension of ["", ...EXTENSIONS]) {
    const path = base + extension
    if (existsSync(path) && statSync(path).isFile()) return path
  }
  throw new Error(`${relative(SRC, from)}: cannot resolve ${specifier}`)
}

/** Every module reachable from `entry`, with the chain that reaches it. */
function reachable(entry: string): Map<string, string[]> {
  const chains = new Map<string, string[]>([[entry, [entry]]])
  const queue = [entry]
  while (queue.length > 0) {
    const file = queue.shift()!
    for (const specifier of runtimeImports(readFileSync(file, "utf8"))) {
      const target = resolveImport(file, specifier)
      if (target && !chains.has(target)) {
        chains.set(target, [...chains.get(file)!, target])
        queue.push(target)
      }
    }
  }
  return chains
}

const files = sourceFiles(SRC)
const clientEntries = files.filter((file) => isClientEntry(readFileSync(file, "utf8")))
const SERVICE_CLIENT = join(SRC, "lib", "supabase.ts")
const SERVER_DIR = join(SRC, "server") + sep

function show(chain: string[]): string {
  return chain.map((file) => relative(SRC, file)).join(" -> ")
}

describe("client bundle boundary", () => {
  it("finds the client components and follows their imports", () => {
    expect(clientEntries.length).toBeGreaterThan(0)
    expect(runtimeImports('import type { A } from "@/lib/supabase"\nimport { b } from "./b"')).toEqual(["./b"])
    expect(isClientEntry('// note\n"use client"\nimport x from "y"')).toBe(true)
    expect(isClientEntry('import x from "y"\n"use client"')).toBe(false)
  })

  it.each(clientEntries.map((file) => [relative(SRC, file), file]))(
    "%s never loads the service-role client or src/server",
    (_name, entry) => {
      const offending = [...reachable(entry).entries()]
        .filter(([file]) => file === SERVICE_CLIENT || file.startsWith(SERVER_DIR))
        .map(([, chain]) => show(chain))
      expect(offending).toEqual([])
    }
  )

  it("guards every module that reads the service-role key or creates the service client with server-only", () => {
    const unguarded = files.filter((file) => {
      const source = readFileSync(file, "utf8")
      const sensitive = /SUPABASE_SERVICE_ROLE_KEY|export function dbService/.test(source)
      return sensitive && !/^import ["']server-only["']/m.test(source)
    })
    expect(unguarded.map((file) => relative(SRC, file))).toEqual([])
    expect(readFileSync(SERVICE_CLIENT, "utf8")).toMatch(/^import "server-only"/m)
  })

  it("guards the statement-import entry points with server-only", () => {
    for (const path of [
      "server/channels/index.ts",
      "server/channels/statement-import/index.ts",
      "server/channels/statement-import/pipeline.ts",
      "server/channels/statement-import/rpc.ts",
      "server/statement-parsers/index.ts",
      "server/inbound/processors.ts",
    ]) {
      expect(readFileSync(join(SRC, path), "utf8"), path).toMatch(/^import "server-only"/m)
    }
  })
})
