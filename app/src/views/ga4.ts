import { escHtml } from './layout'

const GA4_MEASUREMENT_ID_RE = /^G-[A-Z0-9]+$/

export function ga4Snippet(id: string | undefined): string {
  const measurementId = id?.trim()
  if (!measurementId || !GA4_MEASUREMENT_ID_RE.test(measurementId)) {
    return ''
  }

  const escapedId = escHtml(measurementId)
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${escapedId}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag(){window.dataLayer.push(arguments);};
  window.gtag('js', new Date());
  window.gtag('config', '${escapedId}');
</script>`
}
