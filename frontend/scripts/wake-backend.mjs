// Before a build on Vercel: wake the backend, which sleeps on Render's free plan, so the public
// pages built next don't each wait on it. Does nothing elsewhere, and never fails the build itself.
// (No process.exit() after a fetch: on Windows that can abort Node; the script just ends.)

async function wake(origin) {
  const deadline = Date.now() + 4 * 60_000; // a Render deploy in progress can take a few minutes
  for (let attempt = 1; Date.now() < deadline; attempt += 1) {
    try {
      const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(90_000) });
      if (response.ok) {
        console.log(`Backend is awake (attempt ${attempt}).`);
        return;
      }
      console.log(`Backend answered ${response.status}; trying again…`);
    } catch (caught) {
      console.log(`Backend not answering yet (${caught instanceof Error ? caught.message : caught}); trying again…`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
  console.warn("The backend didn't wake within 4 minutes; building anyway.");
}

const origin = process.env.DJANGO_ORIGIN?.trim().replace(/\/+$/, "");
if (process.env.VERCEL && origin) await wake(origin);
