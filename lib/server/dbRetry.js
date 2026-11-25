export const BUSY = { error: "The server is busy. Please try again in a moment.", status: 503 };

export async function readRetry(run, tries = 3) {
  for (let i = 0; i < tries; i += 1) {
    const res = await run().catch((error) => ({ data: null, error }));
    if (!res?.error) return res;
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 250 * (i + 1)));
  }
  return null;
}
