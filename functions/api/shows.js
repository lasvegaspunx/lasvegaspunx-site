// /functions/api/shows.js
// PUBLIC, unprotected endpoint. GET only, read-only. This is what the public
// site's calendar sections fetch, so it deliberately sits OUTSIDE Access
// protection, unauthenticated visitors need to be able to read it.
//
// Writing happens through /api/admin/shows instead (see that file), which
// IS behind Access. Do not add a POST handler here, that would defeat the
// whole point of this split.
//
// Requires a KV namespace bound as `SHOWS`.

const KV_KEY = 'shows-list';

export async function onRequestGet(context) {
  const data = await context.env.SHOWS.get(KV_KEY);
  return new Response(data || '[]', {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}
