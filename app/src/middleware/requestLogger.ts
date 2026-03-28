// app/src/middleware/requestLogger.ts
/**
 * Structured JSON request logger — pino-compatible log lines.
 *
 * Runs as the outermost middleware to capture total request duration.
 * No PII (email, phone, dietary) appears in log output.
 *
 * @req SEC-06 — structured logging, no PII in logs
 */
import { createMiddleware } from 'hono/factory'

export type LogLineInput = {
  reqId: string
  method: string
  path: string
  status: number
  durationMs: number
  traceId?: string
}

export type LogLine = LogLineInput & {
  level: number
  msg: string
  time: number
}

/** Map HTTP status ranges to pino numeric levels. */
function statusToLevel(status: number): number {
  if (status >= 500) return 50 // error
  if (status >= 400) return 40 // warn
  return 30 // info
}

/** Redact known PII query parameters. */
export function stripPii(path: string): string {
  return path.replace(
    /([?&])(email|phone|dietary)=[^&]*/gi,
    '$1$2=[REDACTED]',
  )
}

/** Build a structured log object (pure, testable). */
export function buildLogLine(input: LogLineInput): LogLine {
  return {
    ...input,
    path: stripPii(input.path),
    level: statusToLevel(input.status),
    msg: `${input.method} ${stripPii(input.path)} ${input.status}`,
    time: Date.now(),
  }
}

/**
 * Hono middleware: logs every request as structured JSON via console.log.
 * Generates a unique reqId per request (first 8 chars of crypto.randomUUID).
 */
export function requestLogger() {
  return createMiddleware(async (c, next) => {
    const reqId = crypto.randomUUID().slice(0, 8)
    const start = performance.now()

    // Store reqId on context for downstream use (tracing correlation)
    c.set('reqId', reqId)

    await next()

    const durationMs = Math.round(performance.now() - start)
    const line = buildLogLine({
      reqId,
      method: c.req.method,
      path: c.req.path + (c.req.raw.url.includes('?') ? '?' + c.req.raw.url.split('?')[1] : ''),
      status: c.res.status,
      durationMs,
      traceId: c.get('traceId') as string | undefined,
    })

    console.log(JSON.stringify(line))
  })
}
