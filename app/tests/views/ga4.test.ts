import { describe, expect, it } from 'vitest'
import { ga4Snippet } from '../../src/views/ga4'

describe('ga4Snippet', () => {
  it('returns an empty string for empty, whitespace, or invalid IDs', () => {
    expect(ga4Snippet(undefined)).toBe('')
    expect(ga4Snippet('')).toBe('')
    expect(ga4Snippet('   ')).toBe('')
    expect(ga4Snippet('UA-123456')).toBe('')
    expect(ga4Snippet('G-bad')).toBe('')
  })

  it('renders the GA4 loader only for a valid measurement ID', () => {
    // Format fixture only — not a live GA4 property.
    const snippet = ga4Snippet('G-ABC123')

    expect(snippet).toContain('https://www.googletagmanager.com/gtag/js?id=G-ABC123')
    expect(snippet).toContain("gtag('config', 'G-ABC123');")
    expect(snippet.match(/G-ABC123/g)).toHaveLength(2)
    expect(snippet).not.toContain('G-OTHER999')
  })
})
