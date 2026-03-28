// app/tests/domain/tracing.test.ts
import { describe, it, expect, vi } from 'vitest'
import { withSpan } from '../../src/domain/tracing'

describe('withSpan()', () => {
  it('returns the result of the wrapped function', async () => {
    const result = await withSpan('test-span', async () => 42)
    expect(result).toBe(42)
  })

  it('logs span with timing via console.log', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await withSpan('my-op', async () => 'ok')

    expect(logSpy).toHaveBeenCalledTimes(1)
    const logged = JSON.parse(logSpy.mock.calls[0][0])
    expect(logged.span).toBe('my-op')
    expect(typeof logged.durationMs).toBe('number')
    expect(logged.level).toBe(20) // debug
    expect(logged.msg).toContain('span:my-op')
    logSpy.mockRestore()
  })

  it('logs error on thrown exception and re-throws', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await expect(
      withSpan('fail-op', async () => { throw new Error('boom') })
    ).rejects.toThrow('boom')

    const logged = JSON.parse(logSpy.mock.calls[0][0])
    expect(logged.error).toBe('boom')
    expect(logged.level).toBe(50) // error
    expect(logged.span).toBe('fail-op')
    logSpy.mockRestore()
  })

  it('accepts optional traceId for correlation', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await withSpan('traced-op', async () => 'x', 'trace-abc')
    const logged = JSON.parse(logSpy.mock.calls[0][0])
    expect(logged.traceId).toBe('trace-abc')
    logSpy.mockRestore()
  })

  it('omits traceId from log when not provided', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await withSpan('no-trace', async () => 'x')
    const logged = JSON.parse(logSpy.mock.calls[0][0])
    expect(logged.traceId).toBeUndefined()
    logSpy.mockRestore()
  })
})
