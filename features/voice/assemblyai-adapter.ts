import type { SessionEvent } from "@/features/session/session.types";
import {
  VoiceNotConfiguredError,
  type VoiceAdapter,
  type VoiceCredentials,
  type VoiceEventSink,
} from "./voice-adapter.types";
import {
  executeResearchTool,
  LIVE_SYSTEM_PROMPT,
  workspaceTools,
  type ResearchToolCall,
  type ResearchToolExecution,
  type WorkspaceRuntime,
} from "./research-tools";
import { createWorkspace } from "@/features/workspace/workspace-model";
import { emptyVoiceTelemetry, recordVoiceTelemetry, type VoiceTelemetrySnapshot } from "./voice-telemetry";
import { workspaceForTool } from "./tool-workspace";

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

export function createAssemblyAIAdapter(credentials?: VoiceCredentials, workspaceRuntime?: WorkspaceRuntime): VoiceAdapter {
  let fallbackWorkspace = createWorkspace();
  const runtime: WorkspaceRuntime = workspaceRuntime ?? {
    getWorkspace: () => fallbackWorkspace,
    setWorkspace: (workspace) => { fallbackWorkspace = workspace; },
    getTavilyApiKey: () => credentials?.tavilyApiKey ?? "",
  };
  let socket: WebSocket | null = null;
  let sessionReady = false;
  let audioContext: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let worklet: AudioWorkletNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let playbackSources: AudioBufferSourceNode[] = [];
  let playbackTime = 0;
  let emit: VoiceEventSink = () => undefined;
  let pendingResults: Array<{ callId: string; execution: ResearchToolExecution }> = [];
  let pendingText: string[] = [];
  let levelListener: (level: number) => void = () => undefined;
  let telemetryListener: (snapshot: VoiceTelemetrySnapshot) => void = () => undefined;
  let telemetry = emptyVoiceTelemetry;
  let replyDone = false;
  let replyActive = false;
  let redirectPending = false;
  let redirectedActionId: string | undefined;
  let generation = 0;
  const activeCalls = new Set<AbortController>();
  const activeActionIds = new Set<string>();

  const trackTelemetry = (message: AssemblyAIEvent) => {
    const nextTelemetry = recordVoiceTelemetry(telemetry, message, Date.now());
    if (nextTelemetry === telemetry) return;
    telemetry = nextTelemetry;
    telemetryListener(telemetry);
  };

  const flushResults = () => {
    if (!replyDone || socket?.readyState !== WebSocket.OPEN) return;
    pendingResults.forEach(({ callId, execution }) => socket?.send(JSON.stringify({
      type: "tool.result", call_id: callId, result: JSON.stringify(execution.result), is_error: execution.isError ?? false,
    })));
    pendingResults = [];
  };

  const sendText = (content: string) => {
    if (!sessionReady || socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ type: "conversation.message", role: "user", content }));
    socket.send(JSON.stringify({ type: "reply.create" }));
    return true;
  };

  const flushText = () => {
    const waiting = pendingText;
    pendingText = [];
    waiting.forEach((content) => {
      if (!sendText(content)) pendingText.push(content);
    });
  };

  const pcmLevel = (buffer: ArrayBuffer) => {
    const samples = new Int16Array(buffer);
    if (!samples.length) return 0;
    let energy = 0;
    for (const sample of samples) energy += (sample / 32768) ** 2;
    return Math.min(1, Math.sqrt(energy / samples.length) * 1.8);
  };

  const floatLevel = (samples: Float32Array) => {
    if (!samples.length) return 0;
    let energy = 0;
    for (const sample of samples) energy += sample ** 2;
    return Math.min(1, Math.sqrt(energy / samples.length) * 1.8);
  };

  const stopPlayback = () => {
    playbackSources.forEach((node) => {
      try { node.stop(); } catch { /* already stopped */ }
    });
    playbackSources = [];
    if (audioContext) playbackTime = audioContext.currentTime;
  };

  const cleanup = async () => {
    sessionReady = false;
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
    pendingText = [];
    replyActive = false;
    redirectPending = false;
    redirectedActionId = undefined;
    levelListener(0);
    activeCalls.forEach((controller) => controller.abort());
    activeCalls.clear();
    activeActionIds.clear();
  };

  return {
    async connect(nextEmit) {
      emit = nextEmit;
      emit({ type: "VOICE_STATE_CHANGED", voiceState: "connecting", at: at() });
      const response = await fetch("/api/voice-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: credentials ? JSON.stringify(credentials) : undefined,
      });
      if (response.status === 503) throw new VoiceNotConfiguredError();
      if (!response.ok) throw new Error("The AssemblyAI session could not be started.");
      const sessionCredentials = (await response.json()) as { token: string; agentId: string };

      audioContext = new AudioContext();
      await audioContext.resume();

      const url = new URL("wss://agents.assemblyai.com/v1/ws");
      url.searchParams.set("token", sessionCredentials.token);
      socket = new WebSocket(url);
      socket.addEventListener("open", () => {
        socket?.send(JSON.stringify({
          type: "session.update",
          session: { agent_id: sessionCredentials.agentId },
        }));
      });
      socket.addEventListener("message", (event) => {
        const message = JSON.parse(String(event.data)) as AssemblyAIEvent;
        trackTelemetry(message);
        if (message.type === "session.ready" && socket?.readyState === WebSocket.OPEN) {
          // Stored-agent binding cannot include inline configuration in the first update.
          socket.send(JSON.stringify({ type: "session.update", session: { tools: workspaceTools, system_prompt: LIVE_SYSTEM_PROMPT } }));
          sessionReady = true;
          flushText();
        }
        if (message.type === "session.error" || message.type === "error" || message.type === "session.ended") {
          sessionReady = false;
        }
        if (message.type === "reply.audio" && typeof message.data === "string" && audioContext) {
          const samples = decodePcm16(message.data);
          levelListener(floatLevel(samples));
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
            if (!playbackSources.length) levelListener(0);
          };
        }
        if (message.type === "reply.started") {
          replyDone = false;
          replyActive = true;
        }
        if (message.type === "input.speech.started") {
          const interruptedActionId = [...activeActionIds].at(-1) ?? pendingResults.at(-1)?.callId;
          const interruptsActiveWork = replyActive || Boolean(interruptedActionId) || playbackSources.length > 0;
          stopPlayback();
          if (interruptsActiveWork) {
            redirectedActionId = interruptedActionId;
            redirectPending = true;
            trackTelemetry({ type: "talkos.interruption.candidate" });
            emit({ type: "INTERRUPTION_STARTED", actionId: interruptedActionId, at: at() });
            generation += 1;
            activeCalls.forEach((controller) => controller.abort());
            activeCalls.clear();
            activeActionIds.clear();
            pendingResults = [];
          }
        }
        if (message.type === "transcript.user" && redirectPending && typeof message.text === "string" && message.text.trim()) {
          emit({ type: "INTERRUPTED", actionId: redirectedActionId, constraint: message.text.trim(), at: at() });
          redirectPending = false;
          redirectedActionId = undefined;
        }
        if (
          message.type === "tool.call" &&
          typeof message.call_id === "string" &&
          typeof message.name === "string" &&
          message.arguments &&
          typeof message.arguments === "object"
        ) {
          const call = message as AssemblyAIEvent & ResearchToolCall;
          const requestedWorkspace = workspaceForTool(call.name);
          if (requestedWorkspace) runtime.setActiveView?.(requestedWorkspace);
          const callGeneration = generation;
          const controller = new AbortController();
          activeCalls.add(controller);
          activeActionIds.add(call.call_id);
          void executeResearchTool(call, runtime, controller.signal).then((execution) => {
            activeCalls.delete(controller);
            activeActionIds.delete(call.call_id);
            if (controller.signal.aborted || callGeneration !== generation) return;
            execution.events.forEach((normalizedEvent) => emit(normalizedEvent));
            pendingResults.push({ callId: call.call_id, execution });
            flushResults();
          }).catch((error: unknown) => {
            activeCalls.delete(controller);
            activeActionIds.delete(call.call_id);
            if (controller.signal.aborted || callGeneration !== generation) return;
            const detail = error instanceof Error ? error.message : "tool_failed";
            const execution: ResearchToolExecution = { events: [{ type: "ACTION_FAILED", actionId: call.call_id, detail, at: at() }], result: { error: detail }, isError: true };
            execution.events.forEach((normalizedEvent) => emit(normalizedEvent));
            pendingResults.push({ callId: call.call_id, execution });
            flushResults();
          });
        }
        if (message.type === "reply.done" && socket?.readyState === WebSocket.OPEN) {
          replyDone = true;
          replyActive = false;
          if (message.status === "interrupted") {
            pendingResults = [];
            stopPlayback();
          } else {
            flushResults();
          }
        }
        const normalized = normalizeVoiceEvent(message);
        if (normalized) emit(normalized);
      });
      socket.addEventListener("close", () => {
        sessionReady = false;
        emit({ type: "CONNECTION_CHANGED", connected: false, mode: "live", at: at() });
      });
      socket.addEventListener("error", () => {
        emit({ type: "SESSION_ERROR", message: "The live voice connection was interrupted. Check Settings and reconnect.", at: at() });
      });
    },

    async startListening() {
      await audioContext?.resume();
      if (!audioContext || worklet) return;
      await audioContext.audioWorklet.addModule("/pcm-processor.js");
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false } });
      source = audioContext.createMediaStreamSource(stream);
      const audioWorklet = new AudioWorkletNode(audioContext, "talkos-pcm-processor", {
        processorOptions: { inputSampleRate: audioContext.sampleRate, targetSampleRate: 24000 },
      });
      audioWorklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        levelListener(pcmLevel(event.data));
        if (sessionReady && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "input.audio", audio: encodeBase64(event.data) }));
      };
      worklet = audioWorklet;
      source.connect(audioWorklet);
    },

    stopListening() {
      worklet?.disconnect();
      source?.disconnect();
      stream?.getTracks().forEach((track) => track.stop());
      worklet = null;
      source = null;
      stream = null;
      levelListener(0);
    },

    submitText(text) {
      const content = text.trim();
      if (!content) return;
      if (!sendText(content)) pendingText.push(content);
    },

    setMuted(muted) {
      stream?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
    },

    setLevelListener(listener) {
      levelListener = listener;
    },

    setTelemetryListener(listener) {
      telemetryListener = listener;
      telemetryListener(telemetry);
    },

    async disconnect() {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: "session.end" }));
      }
      await cleanup();
    },
  };
}
