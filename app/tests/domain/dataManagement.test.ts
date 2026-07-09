import { describe, it, expect } from 'vitest'
import {
  rsvpsToCsv,
  parseCsvRow,
  isSessionFresh,
  dietaryToText,
} from '../../src/domain/dataManagement'

describe('dietaryToText', () => {
  it('converts JSON array to comma-separated text', () => {
    expect(dietaryToText('[{"kind":"vegan"},{"kind":"custom","value":"Gluten-Free"}]')).toBe(
      'vegan, Gluten-Free',
    )
  })
  it('returns empty string for empty array', () => {
    expect(dietaryToText('[]')).toBe('')
  })
  it('returns empty string for invalid JSON', () => {
    expect(dietaryToText('not-json')).toBe('')
  })
})

describe('rsvpsToCsv', () => {
  const baseRsvp = {
    id: 'id-1',
    name: 'Jane Doe',
    email: 'jane@example.com',
    phone: null,
    status: 'attending',
    adults: 2,
    parents_count: 0,
    siblings_count: 0,
    children_count: 1,
    party_total: 3,
    dietary: '[{"kind":"vegan"}]',
    notes: null,
    submitted_at: '2027-06-01T10:00:00Z',
    rsvp_token: 'tok123',
  }

  it('includes header row with correct columns', () => {
    const csv = rsvpsToCsv([])
    expect(csv.split('\n')[0]).toBe(
      'id,name,email,phone,status,adults,parents_count,siblings_count,children_count,party_total,dietary,notes,submitted_at',
    )
  })

  it('serializes a row correctly', () => {
    const csv = rsvpsToCsv([baseRsvp as any])
    const lines = csv.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain('Jane Doe')
    expect(lines[1]).toContain('vegan')
    expect(lines[1]).not.toContain('tok123') // rsvp_token excluded
  })

  it('wraps values containing commas in double quotes', () => {
    const rsvp = { ...baseRsvp, name: 'Doe, Jane' }
    const csv = rsvpsToCsv([rsvp as any])
    expect(csv).toContain('"Doe, Jane"')
  })

  it('escapes double quotes in values', () => {
    const rsvp = { ...baseRsvp, name: 'He said "hello"' }
    const csv = rsvpsToCsv([rsvp as any])
    expect(csv).toContain('"He said ""hello"""')
  })

  it('handles null values as empty string', () => {
    const csv = rsvpsToCsv([baseRsvp as any])
    // phone is null — should be empty field
    const parts = csv.split('\n')[1].split(',')
    const phoneIdx = csv.split('\n')[0].split(',').indexOf('phone')
    expect(parts[phoneIdx]).toBe('')
  })
})

describe('parseCsvRow', () => {
  it('parses a simple CSV row into object', () => {
    const headers = ['name', 'email', 'status']
    const row = 'Jane Doe,jane@example.com,attending'
    expect(parseCsvRow(headers, row)).toEqual({
      name: 'Jane Doe',
      email: 'jane@example.com',
      status: 'attending',
    })
  })

  it('handles quoted fields', () => {
    const headers = ['name', 'notes']
    const row = '"Doe, Jane","Has commas, and stuff"'
    expect(parseCsvRow(headers, row)).toEqual({ name: 'Doe, Jane', notes: 'Has commas, and stuff' })
  })

  it('handles escaped quotes inside quoted fields', () => {
    const headers = ['name']
    const row = '"He said ""hi"""'
    expect(parseCsvRow(headers, row)).toEqual({ name: 'He said "hi"' })
  })

  it('returns null for rows with wrong column count', () => {
    const headers = ['name', 'email', 'status']
    const row = 'only,two'
    expect(parseCsvRow(headers, row)).toBeNull()
  })
})

describe('isSessionFresh', () => {
  it('returns true when session was created within 15 minutes', () => {
    const recent = new Date(Date.now() - 10 * 60 * 1000).toISOString()
    expect(isSessionFresh(recent)).toBe(true)
  })

  it('returns false when session was created more than 15 minutes ago', () => {
    const old = new Date(Date.now() - 20 * 60 * 1000).toISOString()
    expect(isSessionFresh(old)).toBe(false)
  })

  it('returns false for invalid date string', () => {
    expect(isSessionFresh('not-a-date')).toBe(false)
  })
})
