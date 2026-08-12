// /functions/api/test.js
// Temporary diagnostic file. Not tied to any feature, just here to answer
// one question: does ANY new POST route work right now, or is something
// blocking all of them? Safe to delete once we've figured out the real bug.

export async function onRequestPost(context) {
  return new Response(JSON.stringify({ ok: true, message: 'POST reached the function.' }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
