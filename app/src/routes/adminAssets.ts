// app/src/routes/adminAssets.ts
/**
 * Static JS served for admin pages. Exists because the strict admin CSP
 * (middleware/securityHeaders.ts) forbids inline <script> blocks and inline
 * event-handler attributes (onclick="..."); both were used pre-fix and were
 * silently no-ops in a browser — see P0-5 in recommendations.md.
 *
 * Two responsibilities:
 * 1. Confirm-before-submit for any <form data-confirm="message">.
 * 2. Chart.js bootstrap for any <script type="application/json" data-chart-stats>
 *    JSON island (safe under CSP — application/json script tags are inert,
 *    never executed, so CSP script-src does not need to allow them).
 *
 * @req SEC-06 — strict CSP + security headers (no inline scripts/handlers)
 */
import { Hono } from 'hono'

const ADMIN_JS = `(function () {
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (form instanceof HTMLFormElement && form.dataset.confirm) {
      if (!window.confirm(form.dataset.confirm)) e.preventDefault();
    }
  });

  if (typeof Chart === 'undefined') return;

  document.querySelectorAll('[data-chart-stats]').forEach(function (el) {
    var stats;
    try { stats = JSON.parse(el.textContent || '{}'); } catch (e) { return; }

    var statusCtx = document.getElementById('chartStatus');
    if (statusCtx) {
      new Chart(statusCtx, {
        type: 'pie',
        data: {
          labels: ['Attending', 'Waitlist', 'Not Attending', 'Maybe'],
          datasets: [{
            data: [stats.attending, stats.waitlist, stats.not_attending, stats.maybe],
            backgroundColor: ['#4caf50', '#ff9800', '#f44336', '#9c27b0'],
          }],
        },
        options: { plugins: { legend: { position: 'bottom' } } },
      });
    }

    var capCtx = document.getElementById('chartCapacity');
    if (capCtx) {
      new Chart(capCtx, {
        type: 'bar',
        data: {
          labels: ['Attending', 'Capacity'],
          datasets: [{
            data: [stats.attending, stats.capacity || stats.attending],
            backgroundColor: ['#4caf50', '#e0e0e0'],
          }],
        },
        options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
      });
    }
  });
}());
`

const adminAssetsRouter = new Hono<{ Bindings: Env }>()

adminAssetsRouter.get('/rsvp/admin/assets/admin.js', (c) => {
  return c.body(ADMIN_JS, 200, {
    'Content-Type': 'text/javascript; charset=utf-8',
    'Cache-Control': 'public, max-age=3600',
  })
})

export default adminAssetsRouter
