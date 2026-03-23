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

/**
 * Hashes an IP address with SHA-256 and returns the hex digest.
 *
 * Stored as `ip_hash` on the RSVP row for abuse analysis without
 * persisting the raw IP address.
 *
 * @param ip - Raw IP string from CF-Connecting-IP header
 * @returns Hex-encoded SHA-256 hash
 */
export async function generateIpHash(ip: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(ip)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}
