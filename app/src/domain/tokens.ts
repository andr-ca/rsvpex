/**
 * Token and fingerprint utilities for RSVP submissions.
 *
 * All functions are pure (no CF binding dependencies) and run in the
 * Workers runtime — `crypto.randomUUID()` and `crypto.subtle` are available
 * globally without any import.
 *
 * @req SEC-01 — IP addresses must not be stored in plaintext
 */

/**
 * Generates a new RSVP token — a random UUID v4.
 * Used as the stable, guest-facing identifier for edit/cancel links.
 */
export function generateToken(): string {
  return crypto.randomUUID()
}

// Fallback pepper used only when IP_HASH_KEY isn't configured (local dev/tests).
// Better than bare unsalted SHA-256, but production MUST set IP_HASH_KEY via
// `wrangler secret put` — see S-3 in recommendations.md.
const FALLBACK_PEPPER = 'rsvpex-ip-hash-fallback-pepper-set-IP_HASH_KEY-in-production'

/**
 * Hashes an IP address with HMAC-SHA-256 and returns the hex digest.
 *
 * Stored as `ip_hash` on the RSVP row for abuse analysis without persisting
 * the raw IP address. Plain SHA-256 (the previous implementation) is
 * reversible for IPv4 addresses — the entire 2^32 address space brute-forces
 * in seconds, defeating the point of hashing (S-3 in recommendations.md).
 * HMAC with a server-side secret key closes that hole.
 *
 * @param ip - Raw IP string from CF-Connecting-IP header
 * @param hmacKey - Env.IP_HASH_KEY; falls back to a fixed pepper if unset
 * @returns Hex-encoded HMAC-SHA-256 digest
 */
export async function generateIpHash(ip: string, hmacKey?: string): Promise<string> {
  const keyData = new TextEncoder().encode(hmacKey || FALLBACK_PEPPER)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sigBuffer = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(ip))
  const hashArray = Array.from(new Uint8Array(sigBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * Constant-time string comparison — use for comparing secrets (tokens, CSRF
 * values) so timing doesn't leak how many leading characters matched.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a)
  const bBytes = new TextEncoder().encode(b)
  if (aBytes.length !== bBytes.length) return false
  let diff = 0
  for (let i = 0; i < aBytes.length; i++) diff |= aBytes[i] ^ bBytes[i]
  return diff === 0
}
