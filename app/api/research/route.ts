import { NextResponse } from "next/server";

const TAVILY_BASE_URL = "https://api.tavily.com";
const MAX_EXTRACT_URLS = 8;

type ResearchRequest = {
  action?: unknown;
  apiKey?: unknown;
  query?: unknown;
  urls?: unknown;
};

function isPublicWebUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function upstreamError(status: number) {
  if (status === 401 || status === 403) {
    return NextResponse.json({ error: "tavily_key_invalid" }, { status: 401 });
  }
  if (status === 429) {
    return NextResponse.json({ error: "tavily_limit_reached" }, { status: 429 });
  }
  return NextResponse.json({ error: "research_unavailable" }, { status: 502 });
}

export async function POST(request: Request) {
  let body: ResearchRequest;

  try {
    body = await request.json() as ResearchRequest;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  if (!apiKey) {
    return NextResponse.json({ error: "tavily_key_required" }, { status: 401 });
  }

  let path: "/search" | "/extract";
  let payload: Record<string, unknown>;

  if (body.action === "search") {
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (!query) {
      return NextResponse.json({ error: "query_required" }, { status: 400 });
    }

    path = "/search";
    payload = {
      query,
      search_depth: "basic",
      max_results: 5,
      include_answer: false,
      include_raw_content: false,
    };
  } else if (body.action === "extract") {
    if (!Array.isArray(body.urls) || body.urls.length === 0) {
      return NextResponse.json({ error: "urls_required" }, { status: 400 });
    }
    if (body.urls.length > MAX_EXTRACT_URLS) {
      return NextResponse.json({ error: "too_many_urls" }, { status: 400 });
    }
    if (!body.urls.every(isPublicWebUrl)) {
      return NextResponse.json({ error: "invalid_urls" }, { status: 400 });
    }

    path = "/extract";
    payload = {
      urls: body.urls,
      extract_depth: "basic",
      format: "markdown",
      include_images: false,
    };
  } else {
    return NextResponse.json({ error: "invalid_action" }, { status: 400 });
  }

  try {
    const response = await fetch(`${TAVILY_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) return upstreamError(response.status);
    return NextResponse.json(await response.json());
  } catch {
    return NextResponse.json({ error: "research_unavailable" }, { status: 502 });
  }
}
