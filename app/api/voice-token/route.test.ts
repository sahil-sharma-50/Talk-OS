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

    const response = await POST(new Request("http://localhost/api/voice-token", { method: "POST" }));

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

    const response = await POST(new Request("http://localhost/api/voice-token", { method: "POST" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      token: "temporary-token",
      agentId: "agent-123",
      expiresInSeconds: 120,
      region: "us",
    });
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("https://agents.assemblyai.com/v1/token");
    expect(String(url)).toContain("expires_in_seconds=120");
    expect(options.headers.Authorization).toBe("Bearer server-secret");
  });

  it("mints European tokens from the matching regional endpoint", async () => {
    process.env.ASSEMBLYAI_API_KEY = "server-secret";
    process.env.ASSEMBLYAI_AGENT_ID = "agent-123";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: "eu-token" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://localhost/api/voice-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ region: "eu" }),
    }));

    expect(String(fetchMock.mock.calls[0][0])).toBe("https://agents.eu.assemblyai.com/v1/token?expires_in_seconds=120&max_session_duration_seconds=600");
    expect(await response.json()).toMatchObject({ token: "eu-token", region: "eu" });
  });

  it("rejects an unknown voice region before minting a token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://localhost/api/voice-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ region: "nearby" }),
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_region" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses server credentials when a JSON request has no body", async () => {
    process.env.ASSEMBLYAI_API_KEY = "server-secret";
    process.env.ASSEMBLYAI_AGENT_ID = "agent-123";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: "temporary-token" }), { status: 200 }),
    ));

    const response = await POST(new Request("http://localhost/api/voice-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      token: "temporary-token",
      agentId: "agent-123",
      expiresInSeconds: 120,
      region: "us",
    });
  });

  it("uses session credentials supplied by the user without returning the API key", async () => {
    delete process.env.ASSEMBLYAI_API_KEY;
    delete process.env.ASSEMBLYAI_AGENT_ID;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token: "temporary-token" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://localhost/api/voice-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: "user-secret", agentId: "agent-user" }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ token: "temporary-token", agentId: "agent-user", expiresInSeconds: 120, region: "us" });
    expect(JSON.stringify(body)).not.toContain("user-secret");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer user-secret");
  });

  it("rejects an email-shaped Agent ID before calling AssemblyAI", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await POST(new Request("http://localhost/api/voice-token", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ apiKey: "user-secret", agentId: "person@example.com" }),
    }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_agent_id" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
