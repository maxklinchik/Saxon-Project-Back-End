addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url = new URL(request.url);
  // Simple health endpoint and template for adding routes
  if (url.pathname === '/api/health') {
    return new Response(JSON.stringify({ status: 'ok', env: 'worker' }), { headers: { 'Content-Type': 'application/json' } });
  }

  // Example: a minimal players endpoint (needs migration and D1)
  if (url.pathname === '/api/players') {
    try {
      // BOWLING_DB is the D1 binding (configured in wrangler.toml)
      const res = await BOWLING_DB.prepare('SELECT id, name, email, role, created_at, team FROM users WHERE role = ?').bind('player').all();
      const rows = res.results || [];
      return new Response(JSON.stringify(rows), { headers: { 'Content-Type': 'application/json' } });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'DB error', detail: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  }

  return new Response('Not Found', { status: 404 });
}

export { };
