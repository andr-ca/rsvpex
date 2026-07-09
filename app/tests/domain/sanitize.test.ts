// app/tests/domain/sanitize.test.ts
/**
 * @req SEC-06 — description_html sanitization (S-10 in recommendations.md)
 */
import { describe, it, expect } from 'vitest'
import { sanitizeDescriptionHtml } from '../../src/domain/sanitize'

describe('sanitizeDescriptionHtml', () => {
  it('strips <script> tags entirely, including their content', () => {
    const out = sanitizeDescriptionHtml('<p>Hello</p><script>alert(1)</script><p>World</p>')
    expect(out).not.toContain('<script')
    expect(out).not.toContain('alert(1)')
    expect(out).toContain('Hello')
    expect(out).toContain('World')
  })

  it('strips <style>, <iframe>, <object>, <embed>, <link>, <meta>, <base>, <form> tags', () => {
    const dangerous = [
      '<style>body{display:none}</style>',
      '<iframe src="https://evil.example"></iframe>',
      '<object data="evil.swf"></object>',
      '<embed src="evil.swf">',
      '<link rel="stylesheet" href="evil.css">',
      '<meta http-equiv="refresh" content="0;url=evil">',
      '<base href="https://evil.example/">',
      '<form action="https://evil.example"><input name="x"></form>',
    ]
    for (const tag of dangerous) {
      const out = sanitizeDescriptionHtml(`<p>safe</p>${tag}`)
      expect(out).not.toMatch(/<(style|iframe|object|embed|link|meta|base|form)\b/i)
    }
  })

  it('drops event-handler attributes by never copying original attributes through', () => {
    const out = sanitizeDescriptionHtml('<p onclick="alert(1)" onmouseover="evil()">Click me</p>')
    expect(out).not.toContain('onclick')
    expect(out).not.toContain('onmouseover')
    expect(out).toContain('Click me')
  })

  it('drops inline style attributes', () => {
    const out = sanitizeDescriptionHtml('<div style="position:fixed;top:0">content</div>')
    expect(out).not.toContain('style=')
    expect(out).toContain('content')
  })

  it('removes disallowed tags but keeps their text content', () => {
    const out = sanitizeDescriptionHtml('<custom-tag>keep me</custom-tag>')
    expect(out).not.toContain('<custom-tag')
    expect(out).toContain('keep me')
  })

  it('keeps allowed tags without attributes', () => {
    const out = sanitizeDescriptionHtml('<p><strong>bold</strong> and <em>italic</em></p>')
    expect(out).toContain('<p>')
    expect(out).toContain('<strong>bold</strong>')
    expect(out).toContain('<em>italic</em>')
  })

  it('allows <a> with a safe http(s) href and forces target/rel', () => {
    const out = sanitizeDescriptionHtml('<a href="https://example.com/registry">Registry</a>')
    expect(out).toContain('href="https://example.com/registry"')
    expect(out).toContain('target="_blank"')
    expect(out).toContain('rel="noopener noreferrer"')
  })

  it('allows <a> with a mailto: href', () => {
    const out = sanitizeDescriptionHtml('<a href="mailto:host@example.com">Email</a>')
    expect(out).toContain('href="mailto:host@example.com"')
  })

  it('strips javascript: hrefs from <a> tags', () => {
    const out = sanitizeDescriptionHtml('<a href="javascript:alert(1)">Click</a>')
    expect(out).not.toContain('javascript:')
    expect(out).not.toContain('href=')
    expect(out).toContain('<a>')
  })

  it('strips data: hrefs from <a> tags (not in the explicit allowlist)', () => {
    const out = sanitizeDescriptionHtml(
      '<a href="data:text/html,<script>alert(1)</script>">Click</a>',
    )
    expect(out).not.toContain('data:')
    expect(out).not.toContain('href=')
  })

  it('allows relative and fragment hrefs', () => {
    const out1 = sanitizeDescriptionHtml('<a href="/some/path">Relative</a>')
    expect(out1).toContain('href="/some/path"')
    const out2 = sanitizeDescriptionHtml('<a href="#section">Fragment</a>')
    expect(out2).toContain('href="#section"')
  })

  it('handles nested and repeated tags without throwing', () => {
    const out = sanitizeDescriptionHtml(
      '<div><p>One</p><ul><li>Two</li><li>Three</li></ul><blockquote>Four</blockquote><hr></div>',
    )
    expect(out).toContain('One')
    expect(out).toContain('Two')
    expect(out).toContain('Three')
    expect(out).toContain('Four')
  })

  it('is idempotent on already-sanitized output', () => {
    const once = sanitizeDescriptionHtml('<p onclick="x()"><a href="javascript:x()">Link</a></p>')
    const twice = sanitizeDescriptionHtml(once)
    expect(twice).toBe(once)
  })

  it('handles empty and plain-text input without throwing', () => {
    expect(sanitizeDescriptionHtml('')).toBe('')
    expect(sanitizeDescriptionHtml('just plain text, no tags')).toBe('just plain text, no tags')
  })
})
