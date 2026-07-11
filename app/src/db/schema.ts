import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core'

// ─── admin_users ────────────────────────────────────────────────────────────

export const adminUsers = sqliteTable('admin_users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
  lockedUntil: text('locked_until'), // ISO-8601 or null
  twoFactorEnabled: integer('two_factor_enabled', { mode: 'boolean' }).notNull().default(false),
  twoFactorSecret: text('two_factor_secret'),
  recoveryCodes: text('recovery_codes').notNull().default('[]'), // JSON array
  lastLoginAt: text('last_login_at'),
  role: text('role', { enum: ['owner', 'editor', 'host'] })
    .notNull()
    .default('editor'),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
})

// ─── events ─────────────────────────────────────────────────────────────────

export const events = sqliteTable(
  'events',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    hostName: text('host_name'),
    descriptionHtml: text('description_html'),
    timezone: text('timezone').notNull().default('America/Toronto'),
    startAt: text('start_at').notNull(), // ISO-8601
    endAt: text('end_at'),
    locationText: text('location_text'),
    wishlistUrl: text('wishlist_url'),

    visibility: text('visibility', { enum: ['public', 'unlisted', 'private'] })
      .notNull()
      .default('public'),
    accessToken: text('access_token'),
    accessTokenExpiresAt: text('access_token_expires_at'),

    isKidsEvent: integer('is_kids_event', { mode: 'boolean' }).notNull().default(false),
    allowChildren: integer('allow_children', { mode: 'boolean' }).notNull().default(true),
    allowSiblings: integer('allow_siblings', { mode: 'boolean' }).notNull().default(true),
    allowParents: integer('allow_parents', { mode: 'boolean' }).notNull().default(true),
    allowStatusChoice: integer('allow_status_choice', { mode: 'boolean' }).notNull().default(true),

    enableWaitlist: integer('enable_waitlist', { mode: 'boolean' }).notNull().default(false),
    enableHeuristicDupCheck: integer('enable_heuristic_dup_check', { mode: 'boolean' })
      .notNull()
      .default(false),

    locale: text('locale', { enum: ['en', 'fr', 'es'] })
      .notNull()
      .default('en'),

    maxGuestsTotal: integer('max_guests_total'),
    maxPartySizePerRsvp: integer('max_party_size_per_rsvp').notNull().default(10),

    opensAt: text('opens_at'),
    closesAt: text('closes_at'),
    status: text('status', { enum: ['draft', 'published', 'closed', 'archived'] })
      .notNull()
      .default('draft'),

    questions: text('questions').notNull().default('[]'), // JSON array of question objects

    notifyViaEmail: integer('notify_via_email', { mode: 'boolean' }).notNull().default(true),
    notifyViaSms: integer('notify_via_sms', { mode: 'boolean' }).notNull().default(false),
    reminderDaysBefore: integer('reminder_days_before').default(7),

    // Capacity notification sentinels (for NOTIF-03)
    threshold80NotifiedAt: text('threshold_80_notified_at'),
    threshold100NotifiedAt: text('threshold_100_notified_at'),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    createdBy: text('created_by'), // nullable — null for legacy pre-scoping events
    archivedAt: text('archived_at'),
  },
  (table) => [
    index('idx_events_status').on(table.status),
    index('idx_events_visibility').on(table.visibility),
    index('idx_events_start_at').on(table.startAt),
  ],
)

// ─── rsvps ──────────────────────────────────────────────────────────────────

export const rsvps = sqliteTable(
  'rsvps',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    eventId: text('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    email: text('email'),
    phone: text('phone'),

    adults: integer('adults').notNull().default(1),
    parentsCount: integer('parents_count').notNull().default(0),
    siblingsCount: integer('siblings_count').notNull().default(0),
    childrenCount: integer('children_count').notNull().default(0),
    childrenAges: text('children_ages').default('[]'), // JSON array of integers

    dietary: text('dietary').notNull().default('[]'), // JSON array of {kind, value} objects
    notes: text('notes'),
    answers: text('answers').notNull().default('{}'), // JSON object

    status: text('status', { enum: ['attending', 'not_attending', 'maybe', 'waitlist'] })
      .notNull()
      .default('attending'),
    source: text('source', { enum: ['web', 'admin', 'import'] })
      .notNull()
      .default('web'),
    rsvpToken: text('rsvp_token')
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    submittedAt: text('submitted_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    clientSubmittedAt: text('client_submitted_at'),

    ipHash: text('ip_hash'),
    userAgent: text('user_agent'),

    // Generated column: sum of all guest counts — D1 supports GENERATED ALWAYS AS STORED
    partyTotal: integer('party_total').generatedAlwaysAs(
      sql`adults + parents_count + siblings_count + children_count`,
      { mode: 'stored' },
    ),

    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text('updated_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_rsvps_event').on(table.eventId),
    index('idx_rsvps_submitted_at').on(table.submittedAt),
    index('idx_rsvps_status').on(table.status),
    index('idx_rsvps_token').on(table.rsvpToken),
  ],
)

// ─── audit_logs ─────────────────────────────────────────────────────────────

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    actorId: text('actor_id').references(() => adminUsers.id, { onDelete: 'set null' }),
    entityType: text('entity_type', { enum: ['event', 'rsvp', 'admin_user'] }).notNull(),
    entityId: text('entity_id').notNull(),
    action: text('action', {
      enum: [
        'create',
        'update',
        'delete',
        'export',
        'login',
        'logout',
        'import',
        'password_reset',
        'capacity_override',
        'token_rotate',
      ],
    }).notNull(),
    diffJson: text('diff_json'), // JSON Merge Patch with PII redacted
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_audit_logs_created_at').on(table.createdAt),
    index('idx_audit_logs_entity').on(table.entityType, table.entityId),
    index('idx_audit_logs_actor').on(table.actorId),
    index('idx_audit_logs_action').on(table.action),
  ],
)

// ─── notification_log ────────────────────────────────────────────────────────
// Idempotency table: prevents duplicate email/SMS sends from queue at-least-once delivery

export const notificationLog = sqliteTable(
  'notification_log',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    rsvpId: text('rsvp_id')
      .notNull()
      .references(() => rsvps.id, { onDelete: 'cascade' }),
    notificationType: text('notification_type').notNull(), // e.g. 'guest_confirmation', 'admin_alert'
    sentAt: text('sent_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex('uidx_notification_log_rsvp_type').on(table.rsvpId, table.notificationType),
  ],
)

// ─── sessions ────────────────────────────────────────────────────────────────

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    adminUserId: text('admin_user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    expiresAt: text('expires_at').notNull(),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_sessions_admin_user').on(table.adminUserId),
    index('idx_sessions_expires_at').on(table.expiresAt),
  ],
)

// ─── password_reset_tokens ────────────────────────────────────────────────────

export const passwordResetTokens = sqliteTable(
  'password_reset_tokens',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    adminUserId: text('admin_user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: text('expires_at').notNull(),
    usedAt: text('used_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_prt_token_hash').on(table.tokenHash),
    index('idx_prt_admin_user').on(table.adminUserId),
  ],
)

// ─── admin_invites ──────────────────────────────────────────────────────────

export const adminInvites = sqliteTable(
  'admin_invites',
  {
    id: text('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    email: text('email').notNull(),
    role: text('role', { enum: ['owner', 'editor', 'host'] })
      .notNull()
      .default('editor'),
    tokenHash: text('token_hash').notNull(),
    expiresAt: text('expires_at').notNull(),
    usedAt: text('used_at'),
    createdAt: text('created_at')
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index('idx_admin_invites_email').on(table.email),
    index('idx_admin_invites_token_hash').on(table.tokenHash),
  ],
)
