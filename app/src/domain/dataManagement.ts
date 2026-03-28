/**
 * Pure domain functions for CSV export, JSON export, and CSV import.
 *
 * @req ADMIN-08 — CSV export
 * @req ADMIN-09 — JSON export with token re-auth gate; CSV import
 */

export type RsvpExportRow = {
  id: string
  name: string
  email: string | null
  phone: string | null
  status: string
  adults: number
  parents_count: number
  siblings_count: number
  children_count: number
  party_total: number
  dietary: string
  notes: string | null
  submitted_at: string
  rsvp_token?: string // only included in JSON export
}

const CSV_HEADERS = [
  'id',
  'name',
  'email',
  'phone',
  'status',
  'adults',
  'parents_count',
  'siblings_count',
  'children_count',
  'party_total',
  'dietary',
  'notes',
  'submitted_at',
] as const

/**
 * Expand dietary JSON array to human-readable comma-separated text.
 * e.g. '[{"kind":"vegan"},{"kind":"custom","value":"Gluten-Free"}]' → 'vegan, Gluten-Free'
 */
export function dietaryToText(json: string): string {
  try {
    const arr = JSON.parse(json) as Array<{ kind: string; value?: string }>
    if (!Array.isArray(arr)) return ''
    return arr.map((d) => d.value || d.kind).join(', ')
  } catch {
    return ''
  }
}

/**
 * Escape and quote a CSV cell value.
 */
function csvCell(val: unknown): string {
  const str = val == null ? '' : String(val)
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

/**
 * Convert an array of RSVP rows to UTF-8 CSV string.
 * Dietary is expanded to human-readable text. rsvp_token is excluded.
 */
export function rsvpsToCsv(rsvps: RsvpExportRow[]): string {
  const lines: string[] = [CSV_HEADERS.join(',')]
  for (const r of rsvps) {
    const row = [
      csvCell(r.id),
      csvCell(r.name),
      csvCell(r.email),
      csvCell(r.phone),
      csvCell(r.status),
      csvCell(r.adults),
      csvCell(r.parents_count),
      csvCell(r.siblings_count),
      csvCell(r.children_count),
      csvCell(r.party_total),
      csvCell(dietaryToText(r.dietary)),
      csvCell(r.notes),
      csvCell(r.submitted_at),
    ]
    lines.push(row.join(','))
  }
  return lines.join('\n')
}

/**
 * Convert RSVP rows to JSON export array (includes rsvp_token).
 */
export function rsvpsToJson(rsvps: RsvpExportRow[]): object[] {
  return rsvps.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    status: r.status,
    adults: r.adults,
    parents_count: r.parents_count,
    siblings_count: r.siblings_count,
    children_count: r.children_count,
    party_total: r.party_total,
    dietary: dietaryToText(r.dietary),
    notes: r.notes,
    submitted_at: r.submitted_at,
    rsvp_token: r.rsvp_token,
  }))
}

/** IMPORT CSV HEADERS (exactly this order, case-insensitive match) */
export const IMPORT_HEADERS = [
  'name',
  'email',
  'phone',
  'status',
  'adults',
  'parents_count',
  'siblings_count',
  'children_count',
  'notes',
] as const

export type ImportRow = {
  name: string
  email?: string
  phone?: string
  status?: string
  adults?: number
  parents_count?: number
  siblings_count?: number
  children_count?: number
  notes?: string
}

/**
 * Parse a single CSV row into a key-value object.
 * Returns null if the column count doesn't match headers.
 * Handles quoted fields and escaped quotes (RFC 4180).
 */
export function parseCsvRow(headers: string[], line: string): Record<string, string> | null {
  const values: string[] = []
  let i = 0
  while (i < line.length) {
    if (line[i] === '"') {
      // Quoted field
      let field = ''
      i++ // skip opening quote
      while (i < line.length) {
        if (line[i] === '"' && line[i + 1] === '"') {
          field += '"'
          i += 2
        } else if (line[i] === '"') {
          i++ // skip closing quote
          break
        } else {
          field += line[i++]
        }
      }
      values.push(field)
      if (line[i] === ',') i++
    } else {
      // Unquoted field
      const end = line.indexOf(',', i)
      if (end === -1) {
        values.push(line.slice(i))
        break
      } else {
        values.push(line.slice(i, end))
        i = end + 1
      }
    }
  }

  if (values.length !== headers.length) return null

  const obj: Record<string, string> = {}
  for (let j = 0; j < headers.length; j++) {
    obj[headers[j]] = values[j]
  }
  return obj
}

/**
 * Check if a session created_at timestamp is within the last 15 minutes.
 */
export function isSessionFresh(createdAt: string, maxAgeMs = 15 * 60 * 1000): boolean {
  const ts = Date.parse(createdAt)
  if (isNaN(ts)) return false
  return Date.now() - ts <= maxAgeMs
}

export type ImportResult = {
  imported: number
  failed: number
  errors: Array<{ row: number; reason: string }>
}

/**
 * Parse and validate import rows. Returns structured result.
 * Does NOT write to DB — routes call db functions directly.
 */
export function parseImportCsv(csvText: string): {
  valid: boolean
  headerError?: string
  rows: Array<{ rowNum: number; data: ImportRow } | { rowNum: number; error: string }>
} {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length === 0) return { valid: false, headerError: 'Empty file', rows: [] }

  const headerLine = lines[0].toLowerCase()
  const parsedHeaders = headerLine.split(',').map((h) => h.trim())

  // Validate required column 'name' is present
  if (!parsedHeaders.includes('name')) {
    return { valid: false, headerError: 'Missing required column: name', rows: [] }
  }

  const rows: Array<{ rowNum: number; data: ImportRow } | { rowNum: number; error: string }> = []

  for (let i = 1; i < lines.length; i++) {
    const rowNum = i + 1 // 1-indexed, 1=header
    const parsed = parseCsvRow(parsedHeaders, lines[i])
    if (!parsed) {
      rows.push({ rowNum, error: `Column count mismatch (expected ${parsedHeaders.length})` })
      continue
    }

    const name = parsed['name']?.trim()
    if (!name) {
      rows.push({ rowNum, error: 'Missing required field: name' })
      continue
    }

    const validStatuses = ['attending', 'not_attending', 'maybe', 'waitlist']
    const status = parsed['status']?.trim()
    if (status && !validStatuses.includes(status)) {
      rows.push({
        rowNum,
        error: `Invalid status: "${status}". Must be one of: ${validStatuses.join(', ')}`,
      })
      continue
    }

    const adults = parsed['adults'] ? parseInt(parsed['adults'], 10) : 1
    if (parsed['adults'] && isNaN(adults)) {
      rows.push({ rowNum, error: 'adults must be a number' })
      continue
    }

    rows.push({
      rowNum,
      data: {
        name,
        email: parsed['email']?.trim() || undefined,
        phone: parsed['phone']?.trim() || undefined,
        status: status || 'attending',
        adults: isNaN(adults) ? 1 : adults,
        parents_count: parseInt(parsed['parents_count'] || '0', 10) || 0,
        siblings_count: parseInt(parsed['siblings_count'] || '0', 10) || 0,
        children_count: parseInt(parsed['children_count'] || '0', 10) || 0,
        notes: parsed['notes']?.trim() || undefined,
      },
    })
  }

  return { valid: true, rows }
}
