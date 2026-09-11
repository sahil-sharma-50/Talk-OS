import type { SessionEvent } from "@/features/session/session.types";
import {
  VoiceNotConfiguredError,
  type VoiceAdapter,
  type VoiceEventSink,
} from "./voice-adapter.types";
import {
  executeResearchTool,
  researchTools,
  type ResearchToolCall,
  type ResearchToolExecution,
} from "./research-tools";

type AssemblyAIEvent = Record<string, unknown> & { type?: string };

const at = () => new Date().toISOString();

export function normalizeVoiceEvent(message: AssemblyAIEvent): SessionEvent | null {
  const text = typeof message.text === "string" ? message.text : "";
  switch (message.type) {
    case "session.ready":
      return { type: "CONNECTION_CHANGED", connected: true, mode: "live", at: at() };
    case "input.speech.started":
      return { type: "VOICE_STATE_CHANGED", voiceState: "listening", at: at() };
    case "input.speech.stopped":
      return { type: "VOICE_STATE_CHANGED", voiceState: "thinking", at: at() };
    case "transcript.user.delta":
      return {
        type: "TRANSCRIPT_PARTIAL",
        speaker: "user",
        text: typeof message.delta === "string" ? message.delta : text,
        at: at(),
      };
    case "transcript.agent.delta":
      return {
        type: "TRANSCRIPT_PARTIAL",
        speaker: "agent",
        text: typeof message.delta === "string" ? message.delta : text,
        at: at(),
      };
    case "transcript.user":
      return { type: "TALK_TURN_FINALIZED", speaker: "user", text, at: at() };
    case "transcript.agent":
      return { type: "TALK_TURN_FINALIZED", speaker: "agent", text, at: at() };
    case "reply.started":
      return { type: "VOICE_STATE_CHANGED", voiceState: "speaking", at: at() };
    case "reply.done":
      return {
        type: "VOICE_STATE_CHANGED",
        voiceState: message.status === "interrupted" ? "interrupted" : "listening",
        at: at(),
      };
    case "tool.call":
      return {
        type: "ACTION_STARTED",
        action: {
          id: typeof message.call_id === "string" ? message.call_id : `tool-${at()}`,
          label: typeof message.name === "string" ? message.name.replaceAll("_", " ") : "Using research tool",
          detail: "AssemblyAI tool call",
          status: "active",
          at: at(),
        },
        at: at(),
      };
    case "session.error":
    case "error":
      return {
        type: "SESSION_ERROR",
        message: typeof message.message === "string" ? message.message : "The live voice session failed.",
        at: at(),
      };
    case "session.ended":
      return { type: "SESSION_STOPPED", at: at() };
    default:
      return null;
  }
}

function encodeBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }
  return btoa(binary);
}

function decodePcm16(data: string): Float32Array {
  const raw = atob(data);
  const samples = new Float32Array(raw.length / 2);
  for (let index = 0; index < samples.length; index += 1) {
    let value = raw.charCodeAt(index * 2) | (raw.charCodeAt(index * 2 + 1) << 8);
    if (value >= 0x8000) value -= 0x10000;
    samples[index] = value / 32768;
  }
  return samples;
}

export function createAssemblyAIAdapter(): VoiceAdapter {
  let socket: WebSocket | null = null;
  let audioContext: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let worklet: AudioWorkletNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let playbackSources: AudioBufferSourceNode[] = [];
  let playbackTime = 0;
  let emit: VoiceEventSink = () => undefined;
  let pendingResults: Array<{ callId: string; execution: ResearchToolExecution }> = [];

  const stopPlayback = () => {
    playbackSources.forEach((node) => {
      try { node.stop(); } catch { /* already stopped */ }
    });
    playbackSources = [];
    if (audioContext) playbackTime = audioContext.currentTime;
  };

  const cleanup = async () => {
    stopPlayback();
    worklet?.disconnect();
    source?.disconnect();
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    worklet = null;
    source = null;
      socket?.close();
    socket = null;
    if (audioContext && audioContext.state !== "closed") await audioContext.close();
    audioContext = null;
    pendingResults = [];
  };

  return {
    async connect(nextEmit) {
      emit = nextEmit;
      emit({ type: "VOICE_STATE_CHANGED", voiceState: "connecting", at: at() });
      const response = await fetch("/api/voice-token", { method: "POST" });
      if (response.status === 503) throw new VoiceNotConfiguredError();
      if (!response.ok) throw new Error("The AssemblyAI session could not be started.");
      const credentials = (await response.json()) as { token: string; agentId: string };

      audioContext = new AudioContext();
      await audioContext.resume();
      await audioContext.audioWorklet.addModule("/pcm-processor.js");
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: false },
      });
      source = audioContext.createMediaStreamSource(stream);
      worklet = new AudioWorkletNode(audioContext, "talkos-pcm-processor", {
        processorOptions: { inputSampleRate: audioContext.sampleRate, targetSampleRate: 24000 },
      });
      source.connect(worklet);

      const url = new URL("wss://agents.assemblyai.com/v1/ws");
      url.searchParams.set("token", credentials.token);
      socket = new WebSocket(url);
      socket.addEventListener("open", () => {
        socket?.send(JSON.stringify({
          type: "session.update",
          session: { agent_id: credentials.agentId, tools: researchTools },
        }));
      });
      worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        if (socket?.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "input.audio", audio: encodeBase64(event.data) }));
        }
      };
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as AssemblyAIEvent;
        if (message.type === "reply.audio" && typeof message.data === "string" && audioContext) {
          const samples = decodePcm16(message.data);
          const buffer = audioContext.createBuffer(1, samples.length, 24000);
          buffer.getChannelData(0).set(samples);
          const playback = audioContext.createBufferSource();
          playback.buffer = buffer;
          playback.connect(audioContext.destination);
          playbackTime = Math.max(playbackTime, audioContext.currentTime);
          playback.start(playbackTime);
          playbackTime += buffer.duration;
          playbackSources.push(playback);
          playback.onended = () => {
            playbackSources = playbackSources.filter((item) => item !== playback);
          };
        }
        if (
          message.type === "tool.call" &&
          typeof message.call_id === "string" &&
          typeof message.name === "string" &&
          message.arguments &&
          typeof message.arguments === "object"
        ) {
          const call = message as AssemblyAIEvent & ResearchToolCall;
          const execution = executeResearchTool(call);
          execution.events.forEach((normalizedEvent) => emit(normalizedEvent));
          pendingResults.push({ callId: call.call_id, execution });
        }
        if (message.type === "reply.done" && socket?.readyState === WebSocket.OPEN) {
          pendingResults.forEach(({ callId, execution }) => {
            socket?.send(JSON.stringify({
              type: "tool.result",
              call_id: callId,
              result: JSON.stringify(execution.result),
              is_error: execution.isError ?? false,
            }));
          });
          pendingResults = [];
        }
        if (message.type === "reply.done" && message.status === "interrupted") stopPlayback();
        const normalized = normalizeVoiceEvent(message);
        if (normalized) emit(normalized);
      });
      socket.addEventListener("close", () => {
        emit({ type: "CONNECTION_CHANGED", connected: false, mode: "live", at: at() });
      });
      socket.addEventListener("error", () => {
        emit({ type: "SESSION_ERROR", message: "The live voice connection was interrupted. Use demo mode or reconnect.", at: at() });
      });
    },

    async startListening() {
      await audioContext?.resume();
    },

    stopListening() {
      worklet?.disconnect();
    },

    interrupt() {
      stopPlayback();
      emit({ type: "VOICE_STATE_CHANGED", voiceState: "interrupted", at: at() });
    },

    async disconnect() {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "session.end" }));
      }
      await cleanup();
    },
  };
}
