/**
 * Server-side HTML sanitizer for admin-authored rich text fields.
 *
 * No DOM is available in Workers, so this is a regex-based allowlist
 * sanitizer rather than a DOMPurify-style tree walk. It is intentionally
 * conservative: any tag not on the allowlist is stripped (its text content
 * is kept), and every surviving tag is rebuilt from scratch with only the
 * attributes this function explicitly recognizes as safe — nothing from the
 * original markup is copied through verbatim. That means `onclick=`,
 * `style=`, `javascript:` hrefs, etc. are dropped by construction, not by
 * pattern-matching them individually.
 *
 * Threat model: `description_html` is admin-authored today (S-10 in
 * recommendations.md), so this is defense-in-depth alongside CSP, not the
 * only control — but it closes the stored-XSS path a future lower-trust
 * "editor" role (S-12) would otherwise open.
 *
 * @req SEC-06 — no unsanitized HTML rendered to guests
 */

const STRIPPED_WITH_CONTENT =
  /<(script|style|iframe|object|embed|link|meta|base|form)\b[^>]*>[\s\S]*?<\/\1\s*>/gi
const STRIPPED_SELF_CLOSING = /<(script|style|iframe|object|embed|link|meta|base|form)\b[^>]*\/?>/gi

const ALLOWED_TAGS = new Set([
  'a',
  'b',
  'i',
  'em',
  'strong',
  'p',
  'br',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'span',
  'div',
  'blockquote',
  'hr',
])

const TAG_PATTERN = /<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g

function safeHref(attrs: string): string | null {
  const match = attrs.match(/href\s*=\s*"([^"]*)"/i) ?? attrs.match(/href\s*=\s*'([^']*)'/i)
  if (!match) return null
  const href = match[1].trim()
  if (/^javascript:/i.test(href)) return null
  if (/^(https?:|mailto:|\/|#)/i.test(href)) return href.replace(/"/g, '&quot;')
  return null
}

/**
 * Sanitizes admin-authored HTML for the event `description_html` field.
 * Call on every write path (create + update) — never trust re-sanitization
 * to happen at render time.
 */
export function sanitizeDescriptionHtml(html: string): string {
  let out = html.replace(STRIPPED_WITH_CONTENT, '').replace(STRIPPED_SELF_CLOSING, '')

  out = out.replace(TAG_PATTERN, (match, tag: string, attrs: string) => {
    const tagLower = tag.toLowerCase()
    if (!ALLOWED_TAGS.has(tagLower)) return ''

    if (match.startsWith('</')) return `</${tagLower}>`

    if (tagLower === 'a') {
      const href = safeHref(attrs)
      return href ? `<a href="${href}" target="_blank" rel="noopener noreferrer">` : '<a>'
    }
    return `<${tagLower}>`
  })

  return out
}
