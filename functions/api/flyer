// /functions/api/flyer.js
// PUBLIC, unprotected. GET only. Serves a single flyer image, stored under
// its own KV key (flyer:<id>) by /api/admin/shows when a show is saved.
//
// Uses a query parameter (/api/flyer?id=xxx) instead of a dynamic route
// segment (/api/flyer/[id].js). The dynamic-route version was a perfectly
// valid file, correct path, correct content, confirmed byte for byte, and
// Cloudflare still refused to route to it, serving the site's homepage
// instead every time. Same unexplained pattern seen twice before with the
// flyer-reading endpoint, where renaming a static file fixed it. Since this
// is a dynamic route rather than a static filename, the safer fix is to
// avoid dynamic routing entirely rather than hope a different bracket name
// works, hence the query-param approach here.
//
// Requires the same KV namespace bound as `SHOWS`.

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const id = url.searchParams.get('id');
  if (!id) return new Response('Missing id', { status: 400 });

  const dataUrl = await context.env.SHOWS.get('flyer:' + id);
  if (!dataUrl) return new Response('Not found', { status: 404 });

  const match = dataUrl.match(/^data:([^;]+);base64,([\s\S]*)$/);
  if (!match) return new Response('Stored flyer data is not in the expected format', { status: 500 });

  const mimeType = match[1];
  const base64 = match[2];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return new Response(bytes, {
    headers: {
      'Content-Type': mimeType,
      // Flyers don't change once uploaded (editing a show doesn't re-upload
      // the image), so a long cache lifetime is safe and saves repeat reads.
      'Cache-Control': 'public, max-age=604800'
    }
  });
}
