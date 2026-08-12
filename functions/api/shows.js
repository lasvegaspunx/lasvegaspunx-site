// /functions/api/shows.js
// Cloudflare Pages Function. Requires a KV namespace bound as `SHOWS`
// (Pages project -> Settings -> Functions -> KV namespace bindings).
//
// This endpoint itself has no login check. It relies on Cloudflare Access
// being set up to protect the /api/shows* path at the edge, same as /admin*.
// If Access ever gets removed from this path, this endpoint becomes a fully
// open read/write API, so don't do that.
//
// On every save, any show with status "confirmed" that doesn't yet have a
// calendarEventId gets pushed to the Google Calendar via a Google Apps
// Script Web App (see calendar-sync.gs.txt). Requires two secrets:
//   CALENDAR_SYNC_URL   - the Apps Script Web App URL
//   CALENDAR_SYNC_TOKEN - matches the SYNC_TOKEN script property in Apps Script
// If those aren't configured, saving still works fine, calendar sync is just
// skipped silently (so this doesn't break the admin tool if not set up yet).

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
  let shows;
  try {
    const body = await context.request.text();
    shows = JSON.parse(body);
    if (!Array.isArray(shows)) throw new Error('Expected an array of shows.');
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'Body must be a valid JSON array.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const syncUrl = context.env.CALENDAR_SYNC_URL;
  const syncToken = context.env.CALENDAR_SYNC_TOKEN;
  const syncErrors = [];

  if (syncUrl && syncToken) {
    for (const show of shows) {
      if (show.status === 'confirmed' && !show.calendarEventId) {
        try {
          const res = await fetch(syncUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: syncToken, show })
          });
          const result = await res.json();
          if (result.ok && result.eventId) {
            show.calendarEventId = result.eventId;
          } else {
            syncErrors.push(`${show.title || 'Untitled show'}: ${result.error || 'unknown error'}`);
          }
        } catch (e) {
          syncErrors.push(`${show.title || 'Untitled show'}: ${e.message}`);
        }
      }
    }
  }

  await context.env.SHOWS.put(KV_KEY, JSON.stringify(shows));

  return new Response(JSON.stringify({ ok: true, shows, syncErrors }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}
