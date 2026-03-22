
-- RSVP Micro‑Site — PostgreSQL DDL (v5.3, consolidated)
-- Target: PostgreSQL 14+

-- =========================
-- Extensions (idempotent)
-- =========================
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =========================
-- Utility: timestamps
-- =========================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

-- =========================
-- Utility: validation helpers
-- =========================

-- Validate that all child ages are between 0 and 17 (inclusive).
CREATE OR REPLACE FUNCTION rsvp_children_ages_valid(int[])
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT $1 IS NULL OR NOT EXISTS (
    SELECT 1 FROM unnest($1) AS x WHERE x < 0 OR x > 17
  );
$$;

-- Optional UUID validator for flexible text IDs (e.g., AuditLog.entity_id)
CREATE OR REPLACE FUNCTION is_uuid(text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT $1 ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
$$;

-- =========================
-- Table: admin_users
-- =========================
CREATE TABLE IF NOT EXISTS admin_users (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 citext UNIQUE NOT NULL,
  password_hash         text NOT NULL,
  display_name          text,
  role                  text NOT NULL CHECK (role IN ('admin','editor')) DEFAULT 'admin',
  is_active             boolean NOT NULL DEFAULT TRUE,
  failed_login_attempts int NOT NULL DEFAULT 0,
  locked_until          timestamptz,
  two_factor_enabled    boolean NOT NULL DEFAULT FALSE,
  two_factor_secret     text,
  recovery_codes        jsonb NOT NULL DEFAULT '[]'::jsonb, -- array of bcrypt-hashed one-time codes
  last_login_at         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT NOW(),
  updated_at            timestamptz NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_admin_users_updated_at
BEFORE UPDATE ON admin_users
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

COMMENT ON TABLE admin_users IS 'Admin accounts for RSVP site management.';
COMMENT ON COLUMN admin_users.recovery_codes IS 'Array of bcrypt-hashed one-time recovery codes; each consumed exactly once.';

-- =========================
-- Table: events
-- =========================
CREATE TABLE IF NOT EXISTS events (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                    text UNIQUE NOT NULL,
  title                   text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  host_name               text,
  description_html        text,
  timezone                text NOT NULL DEFAULT 'America/Toronto',
  start_at                timestamptz NOT NULL,
  end_at                  timestamptz,
  location_text           text,
  wishlist_url            text,

  visibility              text NOT NULL CHECK (visibility IN ('public','unlisted','private')) DEFAULT 'public',
  access_token            uuid,
  access_token_expires_at timestamptz,

  is_kids_event           boolean NOT NULL DEFAULT FALSE,
  allow_children          boolean NOT NULL DEFAULT TRUE,
  allow_siblings          boolean NOT NULL DEFAULT TRUE,
  allow_parents           boolean NOT NULL DEFAULT TRUE,
  allow_status_choice     boolean NOT NULL DEFAULT TRUE,

  enable_waitlist         boolean NOT NULL DEFAULT FALSE,
  enable_heuristic_dup_check boolean NOT NULL DEFAULT FALSE,

  locale                  text NOT NULL DEFAULT 'en' CHECK (locale IN ('en','fr','es')),

  max_guests_total        integer CHECK (max_guests_total IS NULL OR max_guests_total > 0),
  max_party_size_per_rsvp integer NOT NULL DEFAULT 10 CHECK (max_party_size_per_rsvp > 0),

  opens_at                timestamptz,
  closes_at               timestamptz,
  status                  text NOT NULL CHECK (status IN ('draft','published','closed','archived')) DEFAULT 'draft',

  questions               jsonb NOT NULL DEFAULT '[]'::jsonb, -- array of question objects (validated in app)
  CHECK (jsonb_typeof(questions) = 'array'),

  notify_via_email        boolean NOT NULL DEFAULT TRUE,
  notify_via_sms          boolean NOT NULL DEFAULT FALSE,
  reminder_days_before    integer DEFAULT 7 CHECK (reminder_days_before IS NULL OR reminder_days_before BETWEEN 0 AND 60),

  created_at              timestamptz NOT NULL DEFAULT NOW(),
  updated_at              timestamptz NOT NULL DEFAULT NOW(),
  archived_at             timestamptz,

  -- Invariants
  CHECK ( (NOT is_kids_event) OR allow_children = TRUE ),
  CHECK ( (visibility <> 'private') OR access_token IS NOT NULL )
);

CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_visibility ON events(visibility);
CREATE INDEX IF NOT EXISTS idx_events_start_at ON events(start_at);
CREATE INDEX IF NOT EXISTS idx_events_published_start ON events(start_at) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_events_slug_trgm ON events USING gin (slug gin_trgm_ops);

CREATE TRIGGER trg_events_updated_at
BEFORE UPDATE ON events
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

COMMENT ON TABLE events IS 'Events configuration and metadata.';
COMMENT ON COLUMN events.is_kids_event IS 'When true, children must be allowed and UI defaults differ (handled by app).';
COMMENT ON COLUMN events.questions IS 'JSONB array; app validates shape: {id: string, type: text|select, required: bool, ...}.';

-- =========================
-- Table: rsvps
-- =========================
CREATE TABLE IF NOT EXISTS rsvps (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id         uuid NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  name             text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  email            text,
  phone            text,

  adults           integer NOT NULL DEFAULT 1 CHECK (adults >= 0),
  parents_count    integer NOT NULL DEFAULT 0 CHECK (parents_count >= 0),
  siblings_count   integer NOT NULL DEFAULT 0 CHECK (siblings_count >= 0),

  children_count   integer NOT NULL DEFAULT 0 CHECK (children_count >= 0),
  children_ages    int[],
  CHECK (children_count = COALESCE(array_length(children_ages,1),0)),
  CHECK (rsvp_children_ages_valid(children_ages)),

  -- JSONB array of entries: {"kind":"predefined"|"custom","value":"..."}
  dietary          jsonb NOT NULL DEFAULT '[]'::jsonb,
  CHECK (jsonb_typeof(dietary) = 'array'),
  CHECK (jsonb_array_length(dietary) <= 10),

  notes            text,
  CHECK (notes IS NULL OR char_length(notes) <= 1000),

  answers          jsonb NOT NULL DEFAULT '{}'::jsonb,

  status           text NOT NULL CHECK (status IN ('attending','not_attending','maybe','waitlist')) DEFAULT 'attending',
  source           text NOT NULL CHECK (source IN ('web','admin','import')) DEFAULT 'web',
  rsvp_token       uuid NOT NULL DEFAULT gen_random_uuid(),
  submitted_at     timestamptz NOT NULL DEFAULT NOW(),
  client_submitted_at timestamptz,

  ip_hash          text,
  user_agent       text,

  -- Generated helper for app queries and reports (cannot enforce max_party_size purely in DB)
  party_total      integer GENERATED ALWAYS AS (adults + parents_count + siblings_count + children_count) STORED,

  created_at       timestamptz NOT NULL DEFAULT NOW(),
  updated_at       timestamptz NOT NULL DEFAULT NOW(),

  -- Require at least one contact method
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_rsvps_event ON rsvps(event_id);
CREATE INDEX IF NOT EXISTS idx_rsvps_submitted_at ON rsvps(submitted_at);
CREATE INDEX IF NOT EXISTS idx_rsvps_status ON rsvps(status);
CREATE INDEX IF NOT EXISTS idx_rsvps_token ON rsvps(rsvp_token);
CREATE INDEX IF NOT EXISTS idx_rsvps_party_total ON rsvps(event_id, party_total);

-- GIN index for fast dietary containment queries, e.g. dietary @> '[{"value":"vegetarian"}]'
CREATE INDEX IF NOT EXISTS idx_rsvps_dietary ON rsvps USING gin (dietary);

-- Uniqueness constraints for duplicates (per event)
CREATE UNIQUE INDEX IF NOT EXISTS uidx_rsvps_event_email
  ON rsvps(event_id, lower(email))
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_rsvps_event_phone
  ON rsvps(event_id, phone)
  WHERE phone IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_rsvps_event_email_phone
  ON rsvps(event_id, lower(COALESCE(email,'')), COALESCE(phone,''));

CREATE TRIGGER trg_rsvps_updated_at
BEFORE UPDATE ON rsvps
FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

COMMENT ON TABLE rsvps IS 'RSVP submissions (web/admin/import). adults defaults to 1; app sets 0 for kids events.';
COMMENT ON COLUMN rsvps.party_total IS 'Computed sum of adults + parents + siblings + children; checked against event.max_party_size_per_rsvp in app tx.';

-- =========================
-- Table: audit_logs
-- =========================
CREATE TABLE IF NOT EXISTS audit_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  entity_type  text NOT NULL CHECK (entity_type IN ('event','rsvp','admin_user')),
  entity_id    text NOT NULL,
  action       text NOT NULL CHECK (action IN (
                   'create','update','delete','export','login','logout',
                   'import','password_reset','capacity_override','token_rotate'
                 )),
  diff_json    jsonb,
  created_at   timestamptz NOT NULL DEFAULT NOW()
  -- Optional: enforce UUIDs for certain entity types (disabled by default to allow flexibility):
  -- ,CHECK ( (entity_type NOT IN ('event','rsvp','admin_user')) OR is_uuid(entity_id) )
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

COMMENT ON TABLE audit_logs IS 'Security/audit trail with redacted diffs (JSON Merge Patch suggested).';

-- =========================
-- Operational Notes (comments)
-- =========================
-- * Capacity enforcement and waitlist promotions must run inside DB transactions
--   with either SELECT ... FOR UPDATE on the event row or pg_advisory_xact_lock(event_id).
-- * Set lock_timeout (e.g., 5s) at the session or route level to avoid long waits.
-- * Sessions recommended in Postgres; run nightly eviction of expired rows.
-- * In app logic, canonicalize dietary predefined values and keep array length ≤ 10.
-- * Locale is constrained to ('en','fr','es'); extend via migration if needed.
-- * events.questions is validated in app: {id: string, type: 'text'|'select', required: bool, ...}.
-- * Consider a materialized view for dietary aggregation when events > 1k RSVPs.
-- * Recommended extensions are activated at the top: pgcrypto (UUIDs), citext (case-insensitive email), pg_trgm (slug search).
-- * Create dedicated read-only database roles for exports/analytics if needed.
