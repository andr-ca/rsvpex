PRAGMA foreign_keys = ON;
--> statement-breakpoint
-- First public RSVPex event. Idempotent: unique slug/id, ignore if already present.
INSERT OR IGNORE INTO events (
  id, slug, title, host_name, description_html, timezone,
  start_at, end_at, location_text, wishlist_url,
  visibility, is_kids_event, allow_children, allow_siblings, allow_parents,
  allow_status_choice, enable_waitlist, enable_heuristic_dup_check,
  locale, max_guests_total, max_party_size_per_rsvp,
  opens_at, closes_at, status,
  notify_via_email, notify_via_sms, reminder_days_before,
  questions, created_at, updated_at, created_by
) VALUES (
  'evt-open-house-2026',
  'open-house',
  'RSVPex open house',
  'Andrey Malashenko',
  '<p>First public RSVPex event. Confirm whether you can make it — this is a live guest form, not a mock.</p>',
  'America/Toronto',
  '2026-09-20T22:00:00.000Z',
  NULL,
  'Online',
  NULL,
  'public',
  0, 1, 1, 1,
  1, 0, 0,
  'en', NULL, 10,
  NULL, NULL, 'published',
  1, 0, 7,
  '[]',
  datetime('now'),
  datetime('now'),
  NULL
);
