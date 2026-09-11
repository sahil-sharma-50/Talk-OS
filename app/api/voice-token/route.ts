import { NextResponse } from "next/server";

const TOKEN_TTL_SECONDS = 120;
const SESSION_LIMIT_SECONDS = 600;

export async function POST() {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;
  const agentId = process.env.ASSEMBLYAI_AGENT_ID;
  if (!apiKey || !agentId) {
    return NextResponse.json({ error: "voice_not_configured" }, { status: 503 });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const url = new URL("https://agents.assemblyai.com/v1/token");
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
    });
  } catch {
    return NextResponse.json({ error: "voice_unavailable" }, { status: 502 });
  } finally {
    clearTimeout(timeout);
  }
}
