// app/src/domain/tracing.ts
/**
 * Lightweight OTEL-style span helper for Workers.
 *
 * Wraps an async function and logs structured span data (name, duration, optional error)
 * via console.log. Designed for correlation with the request logger's reqId/traceId.
 *
 * Not a full OTEL SDK — just enough to satisfy SEC-06 trace requirements.
 *
 * @req SEC-06 — OTEL traces with custom spans for capacity, duplicates, queue send
 */

export type SpanLog = {
  level: number
  msg: string
  span: string
  durationMs: number
  traceId?: string
  error?: string
  time: number
}

/**
 * Execute `fn` and log a structured span with timing.
 *
 * @param name - Span name (e.g. 'capacity.checkAndInsert', 'duplicates.isDuplicate')
 * @param fn - Async function to trace
 * @param traceId - Optional trace ID for correlation with request logger
 */
export async function withSpan<T>(
  name: string,
  fn: () => Promise<T>,
  traceId?: string,
): Promise<T> {
  const start = performance.now()
  try {
    const result = await fn()
    const durationMs = Math.round(performance.now() - start)
    const log: SpanLog = {
      level: 20, // debug
      msg: `span:${name} ${durationMs}ms`,
      span: name,
      durationMs,
      time: Date.now(),
      ...(traceId ? { traceId } : {}),
    }
    console.log(JSON.stringify(log))
    return result
  } catch (err) {
    const durationMs = Math.round(performance.now() - start)
    const errorMsg = err instanceof Error ? err.message : String(err)
    const log: SpanLog = {
      level: 50, // error
      msg: `span:${name} FAILED ${durationMs}ms: ${errorMsg}`,
      span: name,
      durationMs,
      error: errorMsg,
      time: Date.now(),
      ...(traceId ? { traceId } : {}),
    }
    console.log(JSON.stringify(log))
    throw err
  }
}
