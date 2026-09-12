import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => vi.unstubAllGlobals());

describe("POST /api/research", () => {
  it("searches Tavily with bounded, non-generative settings", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      results: [{ title: "Result", url: "https://example.com", content: "Snippet", score: 0.9 }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(new Request("http://localhost/api/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "search", apiKey: "tvly-test", query: "self-hosted support software" }),
    }));

    expect(response.status).toBe(200);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.tavily.com/search");
    expect(options.headers.Authorization).toBe("Bearer tvly-test");
    expect(JSON.parse(options.body)).toEqual({
      query: "self-hosted support software",
      search_depth: "basic",
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
    });
  });

  it("extracts at most eight public web pages", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [], failed_results: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const urls = Array.from({ length: 8 }, (_, index) => `https://example.com/${index}`);

    const response = await POST(new Request("http://localhost/api/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "extract", apiKey: "tvly-test", urls }),
    }));

    expect(response.status).toBe(200);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ urls, extract_depth: "basic", format: "markdown" });
  });

  it.each([
    [{ action: "search", apiKey: "", query: "test" }, 401, "tavily_key_required"],
    [{ action: "search", apiKey: "tvly-test", query: "" }, 400, "query_required"],
    [{ action: "extract", apiKey: "tvly-test", urls: ["file:///secret"] }, 400, "invalid_urls"],
    [{ action: "extract", apiKey: "tvly-test", urls: Array.from({ length: 9 }, (_, index) => `https://example.com/${index}`) }, 400, "too_many_urls"],
  ])("rejects invalid research requests", async (body, status, error) => {
    const response = await POST(new Request("http://localhost/api/research", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }));

    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
  });
});
