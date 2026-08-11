// /functions/api/shows.js
// Cloudflare Pages Function. Requires a KV namespace bound as `SHOWS`
// (Pages project -> Settings -> Functions -> KV namespace bindings).
//
// This endpoint itself has no login check. It relies on Cloudflare Access
// being set up to protect the /api/shows* path at the edge, same as /admin*.
// If Access ever gets removed from this path, this endpoint becomes a fully
// open read/write API, so don't do that.

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

export async function onRequestPost(context) {
  let body;
  try {
    body = await context.request.text();
    JSON.parse(body); // validate it's actually JSON before storing
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'Body must be valid JSON.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  await context.env.SHOWS.put(KV_KEY, body);

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}
