import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as voice } from "./voice-token/route";
import { POST as research } from "./research/route";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("API request validation", () => {
  it("uses the development Tavily key when the tab supplies no key", async () => {
    vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("TAVILY_API_KEY", "development-key");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ results: [] })); vi.stubGlobal("fetch", fetchMock);
    const response = await research(new Request("http://localhost/api/research", { method: "POST", body: JSON.stringify({ action: "search", query: "release notes" }) }));
    expect(response.status).toBe(200); expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer development-key");
  });
  it("does not use Tavily deployment keys without the production opt-in", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("TAVILY_API_KEY", "server-key"); vi.stubEnv("TALKOS_ALLOW_SERVER_CREDENTIALS", "");
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const response = await research(new Request("http://localhost/api/research", { method: "POST", body: JSON.stringify({ action: "search", query: "release notes" }) }));
    expect(response.status).toBe(401); expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([voice, research])("rejects non-object JSON without throwing", async (handler) => {
    for (const body of ["null", "[]", "true", '"text"']) {
      const response = await handler(new Request("http://localhost/api/test", { method: "POST", headers: { "content-type": "application/json" }, body }));
      expect(response.status).toBe(400);
    }
  });
  it("does not mint deployment-funded tokens for cross-origin requests", async () => {
    const response = await voice(new Request("http://localhost/api/voice-token", { method: "POST", headers: { origin: "https://unrelated.example", "content-type": "application/json" }, body: "{}" }));
    expect(response.status).toBe(403);
  });
  it("requires an explicit opt-in to use server credentials in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ASSEMBLYAI_API_KEY", "server-key");
    vi.stubEnv("ASSEMBLYAI_AGENT_ID", "server-agent");
    vi.stubEnv("TALKOS_ALLOW_SERVER_CREDENTIALS", "");
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const response = await voice(new Request("http://localhost/api/voice-token", { method: "POST" }));
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("still supports visitor-supplied credentials in production", async () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("TALKOS_ALLOW_SERVER_CREDENTIALS", "");
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ token: "temporary" })); vi.stubGlobal("fetch", fetchMock);
    const response = await voice(new Request("http://localhost/api/voice-token", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ apiKey: "visitor-key", agentId: "visitor-agent" }) }));
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer visitor-key");
  });
});
