# Phase 3: Thank-You, ICS & Edit Flow - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-23
**Phase:** 03-thank-you-ics-edit-flow
**Areas discussed:** Thank-you page content, ICS generation approach, Edit flow UX, Custom questions rendering

---

## Thank-You Page Content

| Option | Description | Selected |
|--------|-------------|----------|
| Core fields + dietary summary | Name, event title, date/time, party size, dietary summary | |
| Minimal — name + event title only | Brief acknowledgement only | |
| Full RSVP detail | All fields: party, dietary, custom question answers, notes | ✓ |

**User's choice:** Full RSVP detail

| Option | Description | Selected |
|--------|-------------|----------|
| Prominent button after summary | Below RSVP summary, before ICS section | ✓ |
| Text link at the bottom | Small link at page bottom | |
| Inline with event details | Next to event title | |

**User's choice:** Prominent button after summary (gift registry)

| Option | Description | Selected |
|--------|-------------|----------|
| Two buttons: Download Calendar + Edit RSVP | Both as equal-weight buttons at bottom | ✓ |
| ICS download only | No edit link on thank-you page | |
| ICS button + subtle edit text link | ICS prominent, edit as text | |

**User's choice:** Two equal-weight buttons (Download Calendar + Edit RSVP)

---

## ICS Generation Approach

| Option | Description | Selected |
|--------|-------------|----------|
| ical-generator library | Pure JS, Workers-compatible, RFC 5545 + VTIMEZONE built-in | ✓ |
| Manual RFC 5545 string | Full control, zero deps, complex VTIMEZONE | |
| ics npm package | Lighter, less complete on VTIMEZONE | |

**User's choice:** ical-generator library

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated GET /rsvp/ics/:token endpoint | Separate endpoint, token as auth | ✓ |
| Data URI embedded in thank-you page | Base64 anchor in HTML | |
| Inline in thank-you response | Attachment in same response | |

**User's choice:** Dedicated GET /rsvp/ics/:token endpoint

| Option | Description | Selected |
|--------|-------------|----------|
| Event title, date/time, location | SUMMARY, DTSTART/DTEND, LOCATION | |
| Event details + RSVP summary in DESCRIPTION | Above + party size + dietary in DESCRIPTION | ✓ |
| Title and dates only | Minimal | |

**User's choice:** Event details + RSVP summary in DESCRIPTION field

---

## Edit Flow UX

| Option | Description | Selected |
|--------|-------------|----------|
| Edit mode on the existing form route | ?rid=token on /rsvp/:slug activates prefilled edit mode | ✓ |
| Dedicated /rsvp/:slug/edit route | Separate route for edit | |
| Inline on the thank-you page | Accordion on thank-you | |

**User's choice:** Edit mode on existing form route (/rsvp/:slug?rid=<token>)

| Option | Description | Selected |
|--------|-------------|----------|
| Redirect to thank-you page | /rsvp/thank-you?rid=<token> showing updated data | ✓ |
| Inline confirmation on edit form | Inline success message | |
| Redirect to event page with flash | Back to event page | |

**User's choice:** Redirect to thank-you page after save

| Option | Description | Selected |
|--------|-------------|----------|
| Clear error page with host contact guidance | "Link no longer valid. Contact host." | ✓ |
| Silent redirect to event page | No error shown | |
| 401 JSON error | API-style error | |

**User's choice:** Clear error page with host contact guidance

---

## Custom Questions Rendering

| Option | Description | Selected |
|--------|-------------|----------|
| Native HTML controls, server-rendered | input/textarea/checkbox/select from events.questions JSON | ✓ |
| Client-side JS renders from JSON | Inline script builds UI | |
| Skip rendering in Phase 3 | Placeholder only | |

**User's choice:** Native HTML controls, server-rendered

| Option | Description | Selected |
|--------|-------------|----------|
| Flat form fields keyed by question ID | answer_<id>=<value>, multi-select as repeated fields | ✓ |
| Single JSON field | Serialized JSON in one field | |
| Named fields by label | Field names = question labels | |

**User's choice:** Flat form fields keyed by question ID (consistent with dietary pattern)

| Option | Description | Selected |
|--------|-------------|----------|
| Server-side required check per question definition | 400 if required question missing; HTML required attr also set | ✓ |
| Browser-side required attribute only | HTML required, no server enforcement | |
| All optional, no validation | Skip validation | |

**User's choice:** Server-side required check per question definition

---

## the agent's Discretion

- Exact visual styling of the thank-you page
- Wording of the "Editing your RSVP" banner
- ICS UID format (deterministic per RSVP recommended: `<rsvpId>@rsvpex`)
- Error page styling for revoked token
- Whether to show a print-friendly version link on the thank-you page

## Deferred Ideas

None.
