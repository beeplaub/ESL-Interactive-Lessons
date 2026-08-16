/**
 * A deliberately tiny external scheduler. It contains no learner data and
 * only calls BrenUp's authenticated, idempotent notification dispatcher.
 */
async function runNotificationDispatch(env) {
  const response = await fetch(`${env.BRENUP_ORIGIN}/api/cron/notifications`, {
    headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    cf: { cacheTtl: 0, cacheEverything: false },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`BrenUp notification dispatch failed (${response.status}): ${body.slice(0, 240)}`);
  return body;
}

const worker = {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runNotificationDispatch(env));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/health") return new Response("Not found", { status: 404 });
    return Response.json({ service: "brenup-notification-scheduler", schedule: "every 15 minutes", origin: env.BRENUP_ORIGIN });
  },
};

export default worker;
