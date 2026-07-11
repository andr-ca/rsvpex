/**
 * Shared admin page shell: HTML escaping, CSRF hidden-field helper, and the
 * page layout (nav + styles) previously duplicated across adminEvents.ts,
 * adminRsvps.ts, and adminDashboard.ts (see A-4 in recommendations.md).
 *
 * Every admin form MUST call csrfField(csrfToken) inside its <form> — the
 * csrfProtection middleware (middleware/csrf.ts) rejects any admin POST/
 * PATCH/DELETE without a matching `_csrf` field or `X-CSRF-Token` header.
 * This was P0-2 in recommendations.md: no admin form embedded the token,
 * so every admin mutation 403'd outside of tests that set the header by hand.
 */

export function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/** Hidden input carrying the double-submit CSRF token. Embed inside every admin <form>. */
export function csrfField(csrfToken: string): string {
  return `<input type="hidden" name="_csrf" value="${escHtml(csrfToken)}">`
}

const ADMIN_STYLES = `
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; max-width: 960px; margin: 0 auto; padding: 1.5rem; }
    nav { display: flex; gap: 1rem; padding: .75rem 0; border-bottom: 1px solid #ddd; margin-bottom: 2rem; }
    nav a, nav button { text-decoration: none; color: #333; background: none; border: none; cursor: pointer; font-size: 1rem; padding: 0; }
    nav a:hover { color: #0066cc; }
    h1 { margin-top: 0; }
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; }
    .page-header h1 { margin: 0; }
    .actions { display: flex; gap: .5rem; }
    .btn { padding: .5rem 1rem; border: 1px solid #ccc; border-radius: 4px; text-decoration: none; color: #333; background: #f5f5f5; cursor: pointer; font-size: .9rem; display: inline-block; }
    .btn:hover { background: #e5e5e5; }
    .btn-primary { background: #0066cc; color: #fff; border-color: #0066cc; }
    .btn-primary:hover { background: #0055aa; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: .5rem .75rem; text-align: left; border-bottom: 1px solid #eee; }
    th { background: #f5f5f5; font-weight: 600; }
    .badge { padding: .2rem .5rem; border-radius: 3px; font-size: .8rem; text-transform: uppercase; }
    .badge-draft { background: #eee; color: #555; }
    .badge-published { background: #dfd; color: #060; }
    .badge-closed { background: #ffeedd; color: #c60; }
    .badge-archived { background: #eee; color: #999; }
    .badge-attending { background: #dfd; color: #060; }
    .badge-waitlist { background: #ffeedd; color: #c60; }
    .badge-not_attending { background: #fdd; color: #c00; }
    .badge-maybe { background: #eef; color: #339; }
    .error { color: #c00; background: #fee; padding: .75rem; border-radius: 4px; margin-bottom: 1rem; }
    .success { color: #060; background: #efe; padding: .75rem; border-radius: 4px; margin-bottom: 1rem; }
    .warning { color: #840; background: #fff3cd; padding: .75rem; border-radius: 4px; margin-bottom: 1rem; border: 1px solid #ffc107; }
    label { display: block; margin-top: 1rem; font-weight: 600; }
    input, select, textarea { display: block; width: 100%; padding: .5rem; margin-top: .25rem; font-size: 1rem; border: 1px solid #ccc; border-radius: 4px; }
    textarea { min-height: 80px; resize: vertical; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
    .form-check { display: flex; align-items: center; gap: .5rem; margin-top: .75rem; }
    .form-check input { width: auto; margin: 0; }
    .action-row { display: flex; gap: .75rem; margin-top: 1.5rem; flex-wrap: wrap; }
    dl { display: grid; grid-template-columns: 140px 1fr; gap: .5rem .75rem; }
    dt { font-weight: 600; color: #555; }
    code { background: #f0f0f0; padding: .1rem .3rem; border-radius: 3px; font-size: .9em; }
    .filter-bar { display: flex; gap: .75rem; margin-bottom: 1.5rem; flex-wrap: wrap; align-items: flex-end; }
    .filter-bar label { margin: 0; font-weight: normal; font-size: .85rem; }
    .filter-bar input, .filter-bar select { width: auto; min-width: 110px; padding: .4rem; }
    .capacity-meter { margin-bottom: 1rem; color: #555; font-size: .9rem; background: #f5f5f5; padding: .5rem .75rem; border-radius: 4px; }
    .pagination { display: flex; gap: .5rem; margin-top: 1.5rem; flex-wrap: wrap; }
    .pagination a, .pagination span { padding: .4rem .75rem; border: 1px solid #ccc; border-radius: 4px; text-decoration: none; color: #333; }
    .pagination .active { background: #0066cc; color: #fff; border-color: #0066cc; }
    .chart-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; margin-top: 2rem; }
    .chart-card { background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 1rem; }
    .chart-card h3 { margin: 0 0 1rem; font-size: .95rem; color: #555; }
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 2rem; }
    .tile { background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 1.25rem; text-align: center; }
    .tile-value { font-size: 2.5rem; font-weight: 700; color: #0066cc; }
    .tile-label { font-size: .85rem; color: #555; margin-top: .25rem; }
    .tile-status-ok { border-left: 4px solid #4caf50; }
    .tile-status-error { border-left: 4px solid #f44336; }
`

/**
 * Renders the shared admin page shell (nav + styles) around `content`.
 * `csrfToken` is embedded into the nav's logout form (logout is CSRF-exempt
 * server-side, but including it keeps the pattern uniform and harmless).
 */
export function adminPage(title: string, content: string, csrfToken?: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escHtml(title)}</title>
  <style>${ADMIN_STYLES}</style>
</head>
<body>
  <nav>
    <a href="/rsvp/admin/">Dashboard</a>
    <a href="/rsvp/admin/events">Events</a>
    <a href="/rsvp/admin/admins">Admins</a>
    <form method="POST" action="/rsvp/admin/logout" style="margin:0">
      ${csrfToken ? csrfField(csrfToken) : ''}
      <button style="background:none;border:none;cursor:pointer;color:#333;padding:0;font-size:1rem">Log Out</button>
    </form>
  </nav>
  ${content}
  <script src="/rsvp/admin/assets/admin.js" defer></script>
</body>
</html>`
}
