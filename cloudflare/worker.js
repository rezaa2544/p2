/* ═══════════════════════════════════════════════════════════════════
   Cloudflare Worker — edge caching for Payesh (POC)
   Doc: docs/CDN_INTEGRATION_SETUP.md §1-3
   Rules:
     • /api/*            → NEVER cached (origin passthrough, strips no auth)
     • / and /index.html → public, max-age=300, must-revalidate (single file!)
     • hashed-style static assets (js/css/img/fonts) → immutable, 1 year
       (reserved: today the build inlines everything; rule activates if the
       build ever splits assets — see §1.4 of the doc)
     • everything else   → origin passthrough
   Deploy: wrangler / dashboard (manual runbook in the doc — not in CI).
   ═══════════════════════════════════════════════════════════════════ */
export default {
  async fetch(request) {
    const url = new URL(request.url);

    // 1) API is dynamic AND authenticated — never cache, never transform.
    if (url.pathname.startsWith('/api/')) {
      return fetch(request);
    }

    // 2) Static assets with content-hash style names → immutable (1 year).
    if (url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|woff2?)$/)) {
      const res = await fetch(request);
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: {
          'Content-Type': res.headers.get('Content-Type') || 'application/octet-stream',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }

    // 3) The app shell (single-file build) → short TTL + revalidate.
    if (url.pathname === '/' || url.pathname === '/index.html') {
      const res = await fetch(request);
      return new Response(res.body, {
        status: res.status,
        statusText: res.statusText,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'public, max-age=300, must-revalidate',
        },
      });
    }

    // 4) Default: origin passthrough (docs pages, guides, ...).
    return fetch(request);
  },
};
