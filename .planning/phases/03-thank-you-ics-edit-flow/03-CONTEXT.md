# Phase 3: Thank-You, ICS & Edit Flow - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

After a guest submits their RSVP, they see a confirmation page with their full RSVP summary, can download a calendar (.ics) file, optionally visit the gift registry, and can return later to edit their RSVP via a token link. The guest data model (custom questions, dietary normalization, token revocation) is completed in this phase.

Sending confirmation emails is Phase 7. Admin dashboard visibility is Phase 5.

</domain>

<decisions>
## Implementation Decisions

### Thank-You Page Content
- **D-01:** Page shows the full RSVP record: name, event title, date/time, all party fields (adults, children with ages, parents, siblings), dietary entries, custom question answers, and notes.
- **D-02:** Gift registry button is placed prominently below the RSVP summary — a clear call-to-action, not a footer link. Only rendered when `events.wishlist_url` is set.
- **D-03:** Two equal-weight buttons at the bottom: "Download Calendar" and "Edit RSVP". Both are primary actions for the guest.

### ICS Generation
- **D-04:** Use `ical-generator` library (pure JS, no `fs` dependency, Workers-compatible). Handles VTIMEZONE generation and RFC 5545 compliance including Outlook compatibility (GAP-01).
- **D-05:** ICS is served via a dedicated endpoint: `GET /rsvp/ics/:rsvpToken`. The `rsvpToken` acts as the authentication mechanism — no session needed. Returns `Content-Type: text/calendar; charset=utf-8` with `Content-Disposition: attachment; filename="event.ics"`.
- **D-06:** VEVENT contains: SUMMARY (event title), DTSTART/DTEND in the event's IANA timezone, LOCATION (location_text if set), and DESCRIPTION with the RSVP summary (party size + dietary entries). VTIMEZONE block derived from the event's `timezone` field.

### Edit Flow UX
- **D-07:** Edit mode activates on the existing `/rsvp/:slug?rid=<rsvpToken>` route — same route as the public form. When `rid` is present and valid, the form renders prefilled with a visible "Editing your RSVP" banner at the top. No separate `/edit` route.
- **D-08:** On submit, the prefilled edit form calls `PATCH /rsvp/:id` (requires `rid` token in the request). On success, redirects back to `/rsvp/thank-you?rid=<token>` showing the updated RSVP data — same flow as first submission.
- **D-09:** When a guest visits an edit link with a revoked or invalid token, they see a clear error page: "This edit link is no longer valid. Contact the host for a new link." Not a 401 JSON, not a silent redirect.

### Custom Questions Rendering
- **D-10:** Custom questions from `events.questions` JSON are rendered as native HTML controls server-side: `<input type="text">` for short text, `<textarea>` for long text, `<input type="checkbox">` for boolean, `<select>` for single-select, `<select multiple>` for multi-select.
- **D-11:** Answers are submitted as flat form fields keyed by question ID: `answer_<question_id>=<value>`. Multi-select uses repeated fields with the same key. Server parses these into the `answers` JSON column on the RSVP record. Consistent with the `dietary_kind`/`dietary_value` pattern from Phase 2.
- **D-12:** Required validation is server-side: if a question has `required: true` in the question definition, a missing/empty answer returns 400 with the question label in the error. HTML `required` attribute is also set on the control for client-side UX, but the server is the authority.

### the agent's Discretion
- Exact visual styling of the thank-you page (beyond structural layout described above)
- Wording of the "Editing your RSVP" banner
- ICS `UID` format (should be deterministic per RSVP: `<rsvpId>@rsvpex` is acceptable)
- Error page styling for revoked token
- Whether to show a print-friendly version link on the thank-you page

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` §PUB-09 — Thank-you page spec (RSVP summary, wishlist button, ICS download)
- `.planning/REQUIREMENTS.md` §PUB-10 — Edit flow spec (prefill from rid token, PATCH endpoint, 401 without token)
- `.planning/REQUIREMENTS.md` §GUEST-01 — Dietary restrictions: normalized JSONB array, canonical lowercase values
- `.planning/REQUIREMENTS.md` §GUEST-02 — Gift registry URL per event, shown as button on thank-you page
- `.planning/REQUIREMENTS.md` §GUEST-03 — Party composition tracking (adults, children with ages, parents, siblings)
- `.planning/REQUIREMENTS.md` §GUEST-04 — Custom questions: short text, long text, boolean, single-select, multi-select
- `.planning/REQUIREMENTS.md` §GUEST-05 — RSVP token revocation: admin can revoke (regenerates token); old token invalid within 60s
- `.planning/REQUIREMENTS.md` §GAP-01 — ICS VTIMEZONE block required; IANA timezone; RFC 5545 valid; Outlook-compatible

### Existing Implementation (Phase 2 baseline)
- `app/src/routes/rsvpSubmit.ts` — Redirects to `/rsvp/thank-you?rid=<rsvpToken>` on success; `rsvpToken` is the UUID from `rsvps.rsvp_token`
- `app/src/routes/rsvpForm.ts` — Server-rendered HTML pattern; template string approach used for all pages
- `app/src/db/schema.ts` — Full schema: `rsvps.rsvp_token`, `rsvps.answers`, `rsvps.dietary`, `events.questions`, `events.wishlist_url`, `events.timezone`
- `app/src/app.ts` — Hono app with Phase 3 thank-you stub at `GET /rsvp/thank-you`; Phase 3 routes to be added here
- `.planning/phases/02-public-rsvp-form-core/02-SUMMARY.md` — What Phase 2 built, integration points, deviations

### Architecture Constraints
- `CLAUDE.md` §Constraints — Workers runtime: no Node.js APIs, no filesystem, CPU limit 50ms paid

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `app/src/routes/rsvpForm.ts`: Server-rendered HTML form with event lookup, visibility guards, time-window checks — the edit flow reuses this route by checking for `?rid=` param
- `app/src/domain/tokens.ts`: `generateToken()` (UUID v4) — used for rsvpToken generation; Phase 3 adds token revocation logic
- `app/src/db/schema.ts`: `rsvps.rsvpToken` index already exists (`idx_rsvps_token`) — fast token lookup for ICS endpoint and edit flow
- `app/src/app.ts`: Phase 3 thank-you stub already registered at `GET /rsvp/thank-you` — replace with real implementation

### Established Patterns
- **HTML rendering**: Inline template literal strings, no template engine. All existing pages (form, capacity-full, thank-you stub) use this approach.
- **Event lookup**: Raw D1 SQL via `c.env.DB.prepare(...).bind(...).first<T>()` — same pattern for fetching RSVP by token
- **Route organization**: One router per route group (`rsvpForm.ts`, `rsvpSubmit.ts`) — Phase 3 adds `rsvpThankYou.ts`, `rsvpIcs.ts`, `rsvpEdit.ts` (or combined as appropriate)
- **Zod validation**: `rsvpBodySchema.safeParse()` pattern used for all form submissions — PATCH will follow the same pattern
- **Error responses**: `c.json({ error: '...' }, statusCode)` for API errors; `c.html(renderXxx(), statusCode)` for HTML error pages

### Integration Points
- `POST /rsvp/:slug` → redirects to `GET /rsvp/thank-you?rid=<rsvpToken>` (Phase 2 stub, Phase 3 replaces)
- `GET /rsvp/thank-you?rid=<token>` → looks up RSVP by `rsvp_token`, fetches event, renders full confirmation
- `GET /rsvp/ics/:rsvpToken` → looks up RSVP + event, generates ICS, returns attachment
- `GET /rsvp/:slug?rid=<token>` → edit mode on existing form route; `rsvpForm.ts` extended
- `PATCH /rsvp/:id` → new endpoint; requires `rid` token; updates RSVP fields; redirects to thank-you
- `POST /rsvp/admin/rsvps/:id/revoke-token` → token revocation (admin only — Phase 5 exposes UI, Phase 3 implements domain logic)

</code_context>

<specifics>
## Specific Ideas

- The "Editing your RSVP" state is a visible banner, not a subtle indicator — the guest should know unambiguously they are editing, not re-submitting.
- The ICS endpoint uses the rsvpToken as auth (no session required) — this means guests who receive the confirmation email in Phase 7 can also download the ICS directly from the link without a separate login.
- Custom questions follow the same flat-fields pattern as dietary (`dietary_kind[]`, `dietary_value[]`) — downstream planner should ensure the Zod schema is extended consistently.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 03-thank-you-ics-edit-flow*
*Context gathered: 2026-03-23*
