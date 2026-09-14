import { NextResponse } from "next/server";

const TOKEN_TTL_SECONDS = 120;
const SESSION_LIMIT_SECONDS = 600;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: "origin_not_allowed" }, { status: 403 });
  let supplied: { apiKey?: unknown; agentId?: unknown; region?: unknown } = {};
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      const body = await request.text();
      if (body.trim()) supplied = JSON.parse(body) as typeof supplied;
    }
  } catch {
    return NextResponse.json({ error: "invalid_credentials" }, { status: 400 });
  }
  if (!supplied || typeof supplied !== "object" || Array.isArray(supplied)) return NextResponse.json({ error: "invalid_credentials" }, { status: 400 });
  if (supplied.region !== undefined && supplied.region !== "us" && supplied.region !== "eu") return NextResponse.json({ error: "invalid_region" }, { status: 400 });
  const region = supplied.region === "eu" ? "eu" : "us";
  const suppliedKey = typeof supplied.apiKey === "string" ? supplied.apiKey.trim() : "";
  const suppliedAgent = typeof supplied.agentId === "string" ? supplied.agentId.trim() : "";
  if (Boolean(suppliedKey) !== Boolean(suppliedAgent)) return NextResponse.json({ error: "invalid_credentials" }, { status: 400 });
  const allowServerCredentials = process.env.NODE_ENV !== "production" || process.env.TALKOS_ALLOW_SERVER_CREDENTIALS === "true";
  const apiKey = suppliedKey || (allowServerCredentials ? process.env.ASSEMBLYAI_API_KEY : undefined);
  const agentId = suppliedAgent || (allowServerCredentials ? process.env.ASSEMBLYAI_AGENT_ID : undefined);
  if (!apiKey || !agentId) {
    return NextResponse.json({ error: "voice_not_configured" }, { status: 503 });
  }
  if (agentId.includes("@")) {
    return NextResponse.json({ error: "invalid_agent_id" }, { status: 400 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const voiceHost = region === "eu" ? "agents.eu.assemblyai.com" : "agents.assemblyai.com";
  const url = new URL(`https://${voiceHost}/v1/token`);
  url.searchParams.set("expires_in_seconds", String(TOKEN_TTL_SECONDS));
  url.searchParams.set("max_session_duration_seconds", String(SESSION_LIMIT_SECONDS));

  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      return NextResponse.json({ error: "voice_unavailable" }, { status: 502 });
    }
    const data = (await response.json()) as { token?: string };
    if (!data.token) {
      return NextResponse.json({ error: "voice_unavailable" }, { status: 502 });
    }
    return NextResponse.json({
      token: data.token,
      agentId,
      expiresInSeconds: TOKEN_TTL_SECONDS,
      region,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "voice_unavailable" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
