import { describe, it, expect } from 'vitest'
import { generateToken, generateIpHash } from '../../src/domain/tokens'

describe('generateToken', () => {
  it('returns a valid UUID v4', () => {
    const token = generateToken()
    expect(token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it('generates unique tokens', () => {
    const tokens = new Set(Array.from({ length: 100 }, generateToken))
    expect(tokens.size).toBe(100)
  })
})

describe('generateIpHash', () => {
  it('returns a 64-character hex string', async () => {
    const hash = await generateIpHash('203.0.113.1')
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]+$/)
  })

  it('is deterministic for the same input', async () => {
    const hash1 = await generateIpHash('203.0.113.1')
    const hash2 = await generateIpHash('203.0.113.1')
    expect(hash1).toBe(hash2)
  })

  it('produces different hashes for different IPs', async () => {
    const hash1 = await generateIpHash('203.0.113.1')
    const hash2 = await generateIpHash('203.0.113.2')
    expect(hash1).not.toBe(hash2)
  })

  it('handles IPv6 addresses', async () => {
    const hash = await generateIpHash('2001:db8::1')
    expect(hash).toHaveLength(64)
  })
})
