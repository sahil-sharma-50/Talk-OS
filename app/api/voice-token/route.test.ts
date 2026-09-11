import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

describe("POST /api/voice-token", () => {
  const originalKey = process.env.ASSEMBLYAI_API_KEY;
  const originalAgentId = process.env.ASSEMBLYAI_AGENT_ID;

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) delete process.env.ASSEMBLYAI_API_KEY;
    else process.env.ASSEMBLYAI_API_KEY = originalKey;
    if (originalAgentId === undefined) delete process.env.ASSEMBLYAI_AGENT_ID;
    else process.env.ASSEMBLYAI_AGENT_ID = originalAgentId;
  });

  it("returns a typed configuration error without exposing environment values", async () => {
    delete process.env.ASSEMBLYAI_API_KEY;
    delete process.env.ASSEMBLYAI_AGENT_ID;

    const response = await POST();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "voice_not_configured" });
  });

  it("mints a short-lived single-use token on the server", async () => {
    process.env.ASSEMBLYAI_API_KEY = "server-secret";
    process.env.ASSEMBLYAI_AGENT_ID = "agent-123";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: "temporary-token" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      token: "temporary-token",
      agentId: "agent-123",
      expiresInSeconds: 120,
    });
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("https://agents.assemblyai.com/v1/token");
    expect(String(url)).toContain("expires_in_seconds=120");
    expect(options.headers.Authorization).toBe("Bearer server-secret");
  });
});
