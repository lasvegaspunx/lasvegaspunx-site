// /functions/api/admin/shows.js
// PROTECTED endpoint. POST only, this is what actually writes to the shows
// board. Relies on Cloudflare Access covering /api/admin* (same as /admin*)
// to keep this locked to you only. If Access ever stops covering this path,
// this becomes a fully open write API, so don't remove that protection.
//
// This is the counterpart to the public GET-only /api/shows. The admin tool
// reads the current list from /api/shows (public, fine either way) but saves
// changes here instead.
//
// On every save, any show with status "confirmed" that doesn't yet have a
// calendarEventId gets pushed to the Google Calendar via a Google Apps
// Script Web App (see calendar-sync.gs.txt). Requires two secrets:
//   CALENDAR_SYNC_URL   - the Apps Script Web App URL
//   CALENDAR_SYNC_TOKEN - matches the SYNC_TOKEN script property in Apps Script
// If those aren't configured, saving still works fine, calendar sync is just
// skipped silently.
//
// Flyer images: Cloudflare KV caps any single value at 25MB. Storing every
// flyer's full base64 image inline inside the one "shows-list" blob meant
// that blob could eventually hit that cap as more flyers piled up, and once
// it did, this whole write would fail silently (no error surfaced to the
// admin tool, the show just wouldn't actually be there on the next load).
// To avoid that, each flyer image now gets stored under its own KV key
// (flyer:<id>) instead, and the show record just holds a reference URL
// (/api/flyer/<id>) that a separate public endpoint serves the image from.
// This keeps the shows-list blob itself small no matter how many flyers
// pile up over time.
//
// Requires a KV namespace bound as `SHOWS`.

const KV_KEY = 'shows-list';

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

  // Move any freshly-uploaded flyer (still a raw data: URL at this point)
  // out into its own KV entry, and swap the show's flyer field for a
  // reference URL instead. Flyers that were already moved on a previous
  // save (flyer field already starts with /api/flyer/) are left alone,
  // no need to re-store something that's already stored.
  const flyerErrors = [];
  for (const show of shows) {
    if (show.flyer && show.flyer.startsWith('data:')) {
      try {
        await context.env.SHOWS.put('flyer:' + show.id, show.flyer);
        show.flyer = '/api/flyer/' + show.id;
      } catch (e) {
        // Important: do NOT touch show.flyer here. Leave the original inline
        // data: URL exactly as it was, that's what was previously wiping out
        // pictures whenever this storage step failed, the image would still
        // have worked fine the old inline way, but got blanked out instead.
        // Leaving it alone means a failed migration just falls back to the
        // old (working, if larger) behavior for that one show, rather than
        // losing the picture entirely.
        flyerErrors.push(`${show.title || 'Untitled show'}: could not move flyer to separate storage (${e.message}), kept the original inline image instead.`);
      }
    }
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

  try {
    await context.env.SHOWS.put(KV_KEY, JSON.stringify(shows));
  } catch (e) {
    // This used to throw uncaught, which Cloudflare turns into a generic
    // HTML 502 page, the admin tool would just see a failed fetch with no
    // useful explanation. Now it comes back as a clear JSON error instead.
    return new Response(JSON.stringify({
      ok: false,
      error: 'Could not save the show list: ' + e.message + '. If this mentions size, the show list itself is too large, moving flyers to their own storage (done above) should prevent this going forward, but a genuinely huge board could still hit it.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return new Response(JSON.stringify({ ok: true, shows, syncErrors, flyerErrors }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}
