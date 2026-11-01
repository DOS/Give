/**
 * A minimal stand-in for the supabase-js client in action tests. Every query
 * chain records its table and calls, and resolves to whatever the test's
 * handler returns for it. RPCs and storage calls go through the same handler.
 */

export interface Call {
  target: string
  ops: [string, ...unknown[]][]
}

export type Result = { data?: unknown; error?: { code?: string; message?: string } | null; count?: number | null }
export type Handler = (call: Call) => Result | undefined

export function fakeDb(handler: Handler, log: Call[] = []) {
  const run = (call: Call): Promise<Result> => {
    log.push(call)
    const result = handler(call) ?? {}
    return Promise.resolve({ data: result.data ?? null, error: result.error ?? null, count: result.count ?? null })
  }

  const chain = (target: string, ops: Call["ops"] = []) => {
    const call: Call = { target, ops }
    const builder: Record<string, unknown> = {}
    for (const op of [
      "select",
      "insert",
      "update",
      "delete",
      "eq",
      "neq",
      "gt",
      "gte",
      "lt",
      "lte",
      "in",
      "is",
      "not",
      "or",
      "order",
      "limit",
      "range",
      "abortSignal",
    ]) {
      builder[op] = (...args: unknown[]) => {
        call.ops.push([op, ...args])
        return builder
      }
    }
    for (const op of ["maybeSingle", "single"]) {
      builder[op] = () => {
        call.ops.push([op])
        return run(call)
      }
    }
    builder.then = (resolve: (value: Result) => unknown, reject: (reason: unknown) => unknown) =>
      run(call).then(resolve, reject)
    return builder
  }

  return {
    from: (table: string) => chain(table),
    rpc: (fn: string, args: unknown) => chain(`rpc:${fn}`, [["args", args]]),
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, body: unknown, options: unknown) =>
          run({ target: `storage:${bucket}`, ops: [["upload", path, body, options]] }),
        remove: (paths: string[]) => run({ target: `storage:${bucket}`, ops: [["remove", paths]] }),
        list: (prefix: string, options: unknown) =>
          run({ target: `storage:${bucket}`, ops: [["list", prefix, options]] }),
        download: (path: string) => run({ target: `storage:${bucket}`, ops: [["download", path]] }),
      }),
    },
  }
}

/** The first op of a call with this name, e.g. op(call, "update") -> [values]. */
export function op(call: Call | undefined, name: string): unknown[] | undefined {
  return call?.ops.find(([n]) => n === name)?.slice(1)
}
