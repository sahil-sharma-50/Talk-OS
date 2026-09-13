export type VoiceTelemetryKind =
  | "session_ready"
  | "speech_started"
  | "endpoint_detected"
  | "transcript_streaming"
  | "turn_finalized"
  | "reply_started"
  | "playback_started"
  | "reply_completed"
  | "interruption_candidate"
  | "interruption_confirmed"
  | "tool_started"
  | "session_ended"
  | "session_error";

export interface AssemblyTelemetryEvent {
  type?: string;
  status?: unknown;
  text?: unknown;
  delta?: unknown;
  name?: unknown;
}

export interface VoiceTelemetryEntry {
  id: string;
  kind: VoiceTelemetryKind;
  label: string;
  detail?: string;
  receivedAt: number;
}

export interface VoiceTelemetrySnapshot {
  eventSequence?: number;
  connected: boolean;
  events: VoiceTelemetryEntry[];
  endpointLatencyMs: number | null;
  responseLatencyMs: number | null;
  lastEndpointAt: number | null;
  lastUserFinalAt: number | null;
  awaitingResponse?: boolean;
}

export const emptyVoiceTelemetry: VoiceTelemetrySnapshot = {
  connected: false,
  events: [],
  endpointLatencyMs: null,
  responseLatencyMs: null,
  lastEndpointAt: null,
  lastUserFinalAt: null,
};

function shortText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text) return undefined;
  return text.length > 96 ? `${text.slice(0, 93)}...` : text;
}

function eventEntry(event: AssemblyTelemetryEvent, receivedAt: number): Omit<VoiceTelemetryEntry, "id"> | null {
  const transcriptDetail = shortText(event.delta) ?? shortText(event.text);
  switch (event.type) {
    case "session.ready":
      return { kind: "session_ready", label: "Session ready", receivedAt };
    case "input.speech.started":
      return { kind: "speech_started", label: "Speech started", receivedAt };
    case "input.speech.stopped":
      return { kind: "endpoint_detected", label: "Endpoint detected", receivedAt };
    case "transcript.user.delta":
      return { kind: "transcript_streaming", label: "Streaming user transcript", detail: transcriptDetail, receivedAt };
    case "transcript.agent.delta":
      return { kind: "transcript_streaming", label: "Streaming agent transcript", detail: transcriptDetail, receivedAt };
    case "transcript.user":
      return { kind: "turn_finalized", label: "User turn finalized", detail: transcriptDetail, receivedAt };
    case "transcript.agent":
      return { kind: "turn_finalized", label: "Agent turn finalized", detail: transcriptDetail, receivedAt };
    case "reply.started":
      return { kind: "reply_started", label: "Reply started", receivedAt };
    case "talkos.playback.started":
      return { kind: "playback_started", label: "Speech playback started", receivedAt };
    case "reply.done":
      return event.status === "interrupted"
        ? { kind: "interruption_confirmed", label: "Interruption confirmed", receivedAt }
        : { kind: "reply_completed", label: "Reply completed", receivedAt };
    case "talkos.interruption.candidate":
      return { kind: "interruption_candidate", label: "Interruption candidate", receivedAt };
    case "tool.call":
      return {
        kind: "tool_started",
        label: "Tool call started",
        detail: typeof event.name === "string" ? event.name.replaceAll("_", " ") : undefined,
        receivedAt,
      };
    case "session.ended":
      return { kind: "session_ended", label: "Session ended", receivedAt };
    case "session.error":
    case "error":
      return { kind: "session_error", label: "Session error", detail: shortText(event.text), receivedAt };
    default:
      return null;
  }
}

export function recordVoiceTelemetry(
  snapshot: VoiceTelemetrySnapshot,
  event: AssemblyTelemetryEvent,
  receivedAt: number,
): VoiceTelemetrySnapshot {
  if (event.type === "talkos.playback.started" && !snapshot.awaitingResponse) return snapshot;
  const entry = eventEntry(event, receivedAt);
  if (!entry) return snapshot;

  const events = [
    ...snapshot.events,
    { ...entry, id: `${event.type ?? "event"}-${receivedAt}-${snapshot.eventSequence ?? 0}` },
  ].slice(-40);
  let connected = snapshot.connected;
  let endpointLatencyMs = snapshot.endpointLatencyMs;
  let responseLatencyMs = snapshot.responseLatencyMs;
  let lastEndpointAt = snapshot.lastEndpointAt;
  let lastUserFinalAt = snapshot.lastUserFinalAt;
  let awaitingResponse = snapshot.awaitingResponse ?? false;

  if (event.type === "session.ready") connected = true;
  if (event.type === "session.ended") connected = false;
  if (event.type === "input.speech.stopped") lastEndpointAt = receivedAt;
  if (event.type === "transcript.user") {
    endpointLatencyMs = lastEndpointAt === null ? null : Math.max(0, receivedAt - lastEndpointAt);
    lastUserFinalAt = receivedAt;
    responseLatencyMs = null;
    awaitingResponse = true;
  }
  if (event.type === "talkos.playback.started") {
    responseLatencyMs = lastUserFinalAt === null ? null : Math.max(0, Math.round(receivedAt - lastUserFinalAt));
    awaitingResponse = false;
  }

  return {
    eventSequence: (snapshot.eventSequence ?? 0) + 1,
    connected,
    events,
    endpointLatencyMs,
    responseLatencyMs,
    lastEndpointAt,
    lastUserFinalAt,
    awaitingResponse,
  };
}
