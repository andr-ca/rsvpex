// app/tests/domain/request-logger.test.ts
import { describe, it, expect } from 'vitest'
import { buildLogLine, stripPii } from '../../src/middleware/requestLogger'

describe('buildLogLine()', () => {
  it('produces pino-compatible JSON fields', () => {
    const line = buildLogLine({
      reqId: 'abc-123',
      method: 'POST',
      path: '/rsvp/my-event',
      status: 303,
      durationMs: 42,
    })
    expect(line).toMatchObject({
      level: 30, // info
      msg: 'POST /rsvp/my-event 303',
      reqId: 'abc-123',
      method: 'POST',
      path: '/rsvp/my-event',
      status: 303,
      durationMs: 42,
    })
    expect(typeof line.time).toBe('number')
  })

  it('uses level 50 for 5xx status', () => {
    const line = buildLogLine({
      reqId: 'x', method: 'GET', path: '/', status: 500, durationMs: 1,
    })
    expect(line.level).toBe(50) // error
  })

  it('uses level 40 for 4xx status', () => {
    const line = buildLogLine({
      reqId: 'x', method: 'GET', path: '/', status: 403, durationMs: 1,
    })
    expect(line.level).toBe(40) // warn
  })

  it('includes traceId when provided', () => {
    const line = buildLogLine({
      reqId: 'x', method: 'GET', path: '/', status: 200, durationMs: 1, traceId: 'trace-abc',
    })
    expect(line.traceId).toBe('trace-abc')
  })
})

describe('stripPii()', () => {
  it('redacts email query param from path', () => {
    expect(stripPii('/rsvp/x?email=foo@bar.com')).toBe('/rsvp/x?email=[REDACTED]')
  })

  it('redacts phone query param from path', () => {
    expect(stripPii('/rsvp/x?phone=5551234567')).toBe('/rsvp/x?phone=[REDACTED]')
  })

  it('redacts dietary query param from path', () => {
    expect(stripPii('/rsvp/x?dietary=vegan')).toBe('/rsvp/x?dietary=[REDACTED]')
  })

  it('redacts multiple PII params', () => {
    expect(stripPii('/rsvp/x?email=a@b.com&phone=123')).toBe('/rsvp/x?email=[REDACTED]&phone=[REDACTED]')
  })

  it('leaves path without PII params unchanged', () => {
    expect(stripPii('/rsvp/admin/events')).toBe('/rsvp/admin/events')
  })

  it('leaves non-PII query params unchanged', () => {
    expect(stripPii('/rsvp/x?status=attending&page=2')).toBe('/rsvp/x?status=attending&page=2')
  })
})
