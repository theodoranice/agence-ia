export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { init } = await import("./lib/init");
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      await init();
      return;
    } catch (e) {
      console.error(`[init] Base de données indisponible (tentative ${attempt}/10)`, e instanceof Error ? e.message : e);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}
