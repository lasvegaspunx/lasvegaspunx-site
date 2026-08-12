// /functions/api/admin/read-flyer.js
// Cloudflare Pages Function. Receives a base64 flyer image from the admin
// tool and reads it using Gemini's free-tier Flash model. Free through
// Google AI Studio with rate limits (roughly 15 requests/min, 1,000/day),
// no credit card required.
//
// Moved here (under /api/admin/) so it sits behind the same Access
// protection as /admin* and /api/admin/shows, since this costs API quota
// and should never be reachable by randoms.
//
// Note: this used to be named extract-flyer.js, but that exact filename
// mysteriously got a 405 on every POST despite correct content, build logs
// showing a clean compile, and a fresh minimal test route at the same path
// working fine. Renaming it fixed it. Root cause unconfirmed, so if you ever
// rename this file again, retest before assuming it's unrelated.
//
// Requires an environment variable/secret named GEMINI_API_KEY, set in
// the Pages project: Settings -> Environment variables -> Add secret.
// Get a free key at https://aistudio.google.com/apikey
//
// This path relies on Cloudflare Access protecting /api/* the same way
// /api/shows is protected, so only a logged-in admin can trigger it.
//
// Note: on Gemini's free tier, Google may use request data to improve
// their products. Fine for punk show flyers, worth knowing if that ever
// matters for other uses of this endpoint.

const GEMINI_MODEL = 'gemini-3.6-flash';

export async function onRequestPost(context) {
  let payload;
  try {
    payload = await context.request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Body must be JSON.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const { base64, mimeType } = payload;
  if (!base64 || !mimeType) {
    return new Response(JSON.stringify({ error: 'Missing base64 or mimeType.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const apiKey = context.env.GEMINI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY is not configured on the server.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  const prompt = `You extract structured show info from Las Vegas punk/DIY show flyers.
Today's actual date is ${todayStr}. Use this to resolve any date on the flyer that has no year printed, or only a weekday/month/day: pick the nearest occurrence of that date that is on or after today. Never guess a year without reasoning from today's date. If the flyer's printed date has already passed relative to today assuming the current year, roll it to next year instead.

For the title field specifically: list EVERY band name that appears on the flyer, not just the headliner or the largest text. Flyers often show 3-6+ bands in a stacked lineup, scan the whole image top to bottom and capture all of them. Join them with ", " in the order they appear on the flyer (usually headliner first, openers after). If the flyer has a separate overall event name (like a festival or recurring show name) in addition to the band list, put that first, then the bands. Do not drop any band to save space, do not summarize as "and others."

Return ONLY a JSON object, no markdown fences, no preamble, matching exactly this shape:
{"title": string, "venue": string, "date": string (YYYY-MM-DD, resolved per the rule above), "doors": string (e.g. "8:00 PM", empty string if unknown), "price": string (e.g. "Free", "$10", "$8 adv / $10 door", empty string if unknown), "ages": string (one of "All ages", "18+", "21+", best guess if unclear), "flag": string (empty string if nothing is ambiguous or conflicting on the flyer; otherwise a short note on what's unclear or contradictory, e.g. two different dates printed, or say explicitly if you had to infer the year, or say so if you weren't confident you caught every band)}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inline_data: { mime_type: mimeType, data: base64 } },
              { text: prompt }
            ]
          }],
          generationConfig: {
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      return new Response(JSON.stringify({ error: 'Gemini API error: ' + errText }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const data = await geminiRes.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) throw new Error('No response text from Gemini.');

    const clean = rawText.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return new Response(JSON.stringify(parsed), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message || 'Unknown error extracting flyer.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204 });
}
