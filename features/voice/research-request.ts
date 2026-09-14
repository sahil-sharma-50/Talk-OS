interface ResearchResponse {
  error?: string;
  results?: Array<{ title?: string; url?: string; content?: string; raw_content?: string }>;
}

/** Upstream has 20s; the browser has 30s including transport/body decoding;
 * the voice service has 60s including delivery at the next reply boundary. */
export async function requestResearch(body: Record<string, unknown>, signal?: AbortSignal) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  const deadline = new Promise<never>((_, reject) => {
    abort = () => { controller.abort(); reject(new DOMException("interrupted", "AbortError")); };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener("abort", abort, { once: true });
    timer = setTimeout(() => {
      controller.abort();
      reject(new DOMException("research_timed_out", "TimeoutError"));
    }, 30_000);
  });
  try {
    return await Promise.race([
      deadline,
      (async () => {
        const response = await fetch("/api/research", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
        const payload = await response.json() as ResearchResponse;
        if (!payload || typeof payload !== "object" || payload.results !== undefined && !Array.isArray(payload.results)) throw new Error("invalid_research_response");
        return { ok: response.ok, payload };
      })(),
    ]);
  } finally {
    clearTimeout(timer);
    if (abort) signal?.removeEventListener("abort", abort);
  }
}
