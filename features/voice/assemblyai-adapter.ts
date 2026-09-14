import type { SessionEvent, SpeechCaption } from "@/features/session/session.types";
import {
  VoiceNotConfiguredError,
  type VoiceAdapter,
  type VoiceCredentials,
  type VoiceEventSink,
} from "./voice-adapter.types";
import {
  executeResearchTool,
  LIVE_GREETING,
  LIVE_SYSTEM_PROMPT,
  workspaceTools,
  type ResearchToolCall,
  type ResearchToolExecution,
  type WorkspaceRuntime,
} from "./research-tools";
import { createWorkspace } from "@/features/workspace/workspace-model";
import { emptyVoiceTelemetry, recordVoiceTelemetry, type VoiceTelemetrySnapshot } from "./voice-telemetry";
import { SpokenRequest } from "./spoken-request";
import { directWorkspaceNavigation, explicitWorkspaceTarget } from "./workspace-intent";
import { executeWorkspaceControl } from "./workspace-control";
import { TimedReplyCaptions } from "./playback-captions";

export const VOICE_INPUT_CONFIG = {
  // The least-patient preset cuts off multi-clause requests at natural pauses.
  // Keep semantic/adaptive endpointing; barge-in remains immediate independently.
  transcription_mode: "balanced",
  continuous_partials: true,
  turn_detection: { interrupt_response: true, interruption_delay: 0 },
  transcription_prompt: "A conversation about TalkOS, a productivity workspace with Documents, Sheets, Planner, Research, Canvas, Dashboard and Settings tabs. Topics include market research, PRDs, budgets, shopping lists, checklists and tasks.",
};

type AssemblyAIEvent = Record<string, unknown> & { type?: string };

const at = () => new Date().toISOString();
// Ignore low-level lead-in noise in UI state and latency; playback is untouched.
const AUDIBLE_SAMPLE_THRESHOLD = 0.008;
// Four 20 ms frames pause output speculatively. Only a server speech signal
// confirms interruption; unconfirmed noise must not cancel workspace work.
const LOCAL_BARGE_IN_LEVEL = 0.12;
const LOCAL_BARGE_IN_FRAMES = 4;
const REPLY_PROGRESS_TIMEOUT_MS = 45_000;

export function normalizeVoiceEvent(message: AssemblyAIEvent): SessionEvent | null {
  const text = typeof message.text === "string" ? message.text : "";
  const userId = typeof message.item_id === "string" ? { turnId: `user-${message.item_id}` } : {};
  const replyId = typeof message.reply_id === "string" ? { turnId: `agent-${message.reply_id}` } : typeof message.item_id === "string" ? { turnId: `agent-${message.item_id}` } : {};
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
        replace: typeof message.delta !== "string",
        ...userId,
        at: at(),
      };
    case "transcript.agent.delta":
      return {
        type: "TRANSCRIPT_PARTIAL",
        speaker: "agent",
        text: typeof message.delta === "string" ? message.delta : text,
        replace: typeof message.delta !== "string",
        ...replyId,
        at: at(),
      };
    case "transcript.user":
      return { type: "TALK_TURN_FINALIZED", speaker: "user", text, ...userId, at: at() };
    case "transcript.agent":
      return { type: "TALK_TURN_FINALIZED", speaker: "agent", text, ...replyId, at: at() };
    case "reply.started":
      return { type: "VOICE_STATE_CHANGED", voiceState: "thinking", at: at() };
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
  let spokenRequest = new SpokenRequest();
  let fallbackWorkspace = createWorkspace();
  const runtime: WorkspaceRuntime = workspaceRuntime ?? {
    getWorkspace: () => fallbackWorkspace,
    setWorkspace: (workspace) => { fallbackWorkspace = workspace; },
    getTavilyApiKey: () => credentials?.tavilyApiKey ?? "",
  };
  const requestRuntime: WorkspaceRuntime = { ...runtime, getCurrentRequest: () => spokenRequest.text, getCurrentRequestId: () => spokenRequest.id };
  let socket: WebSocket | null = null;
  let sessionReady = false;
  let greetingPending = false;
  let audioContext: AudioContext | null = null;
  let microphoneContext: AudioContext | null = null;
  let stream: MediaStream | null = null;
  let worklet: AudioWorkletNode | null = null;
  let source: MediaStreamAudioSourceNode | null = null;
  let playbackSources: AudioBufferSourceNode[] = [];
  let playbackTime = 0;
  let emit: VoiceEventSink = () => undefined;
  let pendingResults: Array<{ callId: string; execution: ResearchToolExecution; inputVersion: number }> = [];
  let inputVersion = 0;
  const pendingToolReplies: Array<{ callId: string; inputVersion: number; permit: number; cancelled: boolean }> = [];
  const toolReplyVersions = new Map<string, number>();
  let responsePermit = 0;
  const replyPermits = new Map<string, number>();
  const spokenReplies = new Map<number, string>();
  const finishedReplyIds = new Set<string>();
  let pendingText: string[] = [];
  let levelListener: (level: number) => void = () => undefined;
  let lastLevelAt = -Infinity;
  const publishLevel = (level: number) => {
    const now = performance.now();
    if (now - lastLevelAt < 40) return;
    lastLevelAt = now;
    levelListener(level);
  };
  let telemetryListener: (snapshot: VoiceTelemetrySnapshot) => void = () => undefined;
  let telemetry = emptyVoiceTelemetry;
  let replyDone = false;
  let replyActive = false;
  let userSpeaking = false;
  let outputSpeaking = false;
  let navigationConfirmation: { replyId: string | null; view: string; result: Record<string, unknown> } | null = null;
  const audibleWindows = new Map<string, { start: number; end: number }>();
  let redirectPending = false;
  let redirectedActionId: string | undefined;
  let generation = 0;
  let connectionGeneration = 0;
  let tokenController: AbortController | null = null;
  let readyTimeout: ReturnType<typeof setTimeout> | undefined;
  const activeCalls = new Set<AbortController>();
  const activeActionIds = new Set<string>();
  const handledCallIds = new Set<string>();
  const captionReplies = new Map<string, TimedReplyCaptions>();
  const retiredReplyIds = new Set<string>();
  const unspokenReplyIds = new Set<string>();
  let currentReplyId = "";
  let incomingReplyId = "";
  let captionTimer: ReturnType<typeof setInterval> | undefined;
  let replyProgressTimer: ReturnType<typeof setTimeout> | undefined;
  let localSpeechFrames = 0;
  let localPausePending = false;
  let localPauseTimer: ReturnType<typeof setTimeout> | undefined;
  let localSpeechLatched = false;
  let localQuietFrames = 0;
  let lastCaption: SpeechCaption | null = null;

  const retireReply = (id: string) => {
    if (id) retiredReplyIds.add(id);
    unspokenReplyIds.delete(id);
    toolReplyVersions.delete(id);
    replyPermits.delete(id);
    while (retiredReplyIds.size > 100) retiredReplyIds.delete(retiredReplyIds.values().next().value!);
  };
  const advanceInput = () => {
    inputVersion += 1;
    replyDone = false;
    responsePermit += 1;
    // Unlike an ordinary silent reply, a tool result is tied to the request
    // which ran that tool. It must not resume as an answer to the next input.
    for (const [id, version] of toolReplyVersions) if (version < inputVersion) {
      retireReply(id); captionReplies.delete(id);
    }
    // A still-silent conversational reply can be reused for a continued phrase.
    for (const id of unspokenReplyIds) replyPermits.set(id, responsePermit);
  };
  const expectToolReply = (callId: string, version: number, cancelled: boolean) => {
    if (!cancelled && version === inputVersion) responsePermit += 1;
    pendingToolReplies.push({ callId, inputVersion: version, permit: responsePermit, cancelled });
    if (pendingToolReplies.length > 100) pendingToolReplies.shift();
    // An action/result is also a response boundary, even if its spoken
    // confirmation has not arrived. Do not merge "Thanks" into the old task.
    spokenRequest.actionResponded();
  };
  const cancelTool = (callId: string) => {
    pendingResults.push({ callId, inputVersion, execution: { events: [], isError: true, result: { error: "interrupted", status: "interrupted", message: "The user interrupted this action. Do not retry or announce it as successful. Follow the latest request and read the workspace before further edits." } } });
    spokenRequest.actionResponded();
  };
  const acceptSpokenReply = (id: string) => {
    const permit = replyPermits.get(id) ?? responsePermit;
    const chosen = spokenReplies.get(permit);
    if (chosen && chosen !== id) { retireReply(id); captionReplies.delete(id); return false; }
    spokenReplies.set(permit, id);
    // Several silent starts can precede the first audio. Once one speaks, the
    // other starts for that same response cannot own state or captions.
    for (const [other, otherPermit] of replyPermits) if (other !== id && otherPermit === permit) {
      if (currentReplyId === other) { currentReplyId = id; replyActive = !finishedReplyIds.has(id); }
      retireReply(other); captionReplies.delete(other);
    }
    while (spokenReplies.size > 100) spokenReplies.delete(spokenReplies.keys().next().value!);
    return true;
  };
  const playbackClock = () => {
    const timestamp = audioContext?.getOutputTimestamp?.().contextTime;
    return timestamp && timestamp > 0 ? timestamp : audioContext?.currentTime ?? 0;
  };
  const syncSpeaking = () => {
    if (!audioContext || localPausePending) return;
    const now = playbackClock();
    const speaking = audioContext.state === "running" && [...audibleWindows.values()].some(window => now >= window.start && now < window.end);
    if (speaking === outputSpeaking) return;
    outputSpeaking = speaking;
    if (speaking && !userSpeaking && !redirectPending) spokenRequest.responseStarted();
    emit({ type: "VOICE_STATE_CHANGED", voiceState: speaking ? "speaking" : userSpeaking ? "listening" : activeCalls.size ? "acting" : replyActive ? "thinking" : "listening", at: at() });
    if (!speaking) levelListener(0);
  };
  const chooseNavigationReply = (id: string) => {
    if (!navigationConfirmation || navigationConfirmation.replyId || !id) return;
    navigationConfirmation.replyId = id;
    currentReplyId = id;
    // A silent automatic tool reply must not claim the confirmation slot or
    // obscure captions for the first actual spoken acknowledgment.
    for (const other of captionReplies.keys()) if (other !== id) { retireReply(other); captionReplies.delete(other); }
  };

  const publishCaption = (caption: SpeechCaption | null) => {
    if (caption?.turnId === lastCaption?.turnId && caption?.text === lastCaption?.text && caption?.activeStart === lastCaption?.activeStart && caption?.activeEnd === lastCaption?.activeEnd) return;
    lastCaption = caption;
    emit({ type: "SPEECH_CAPTION_UPDATED", caption, at: at() });
  };
  const tickCaptions = () => {
    if (!audioContext || localPausePending) return;
    const now = playbackClock();
    syncSpeaking();
    for (const [id, window] of audibleWindows) if (now >= window.end) audibleWindows.delete(id);
    for (const [id, reply] of captionReplies) if (reply.finished(now)) captionReplies.delete(id);
    const reply = captionReplies.values().next().value;
    publishCaption(reply ? reply.sample(now) ?? { turnId: reply.turnId, text: "", activeStart: 0, activeEnd: 0 } : null);
    if (!captionReplies.size) { clearInterval(captionTimer); captionTimer = undefined; }
  };
  const replyCaptions = (message: AssemblyAIEvent) => {
    const id = typeof message.reply_id === "string" ? message.reply_id : currentReplyId || (currentReplyId = crypto.randomUUID());
    let reply = captionReplies.get(id);
    if (!reply) { reply = new TimedReplyCaptions(`agent-${id}`); captionReplies.set(id, reply); }
    if (!captionTimer) captionTimer = setInterval(tickCaptions, 40);
    return reply;
  };

  const trackTelemetry = (message: AssemblyAIEvent, receivedAt = Date.now()) => {
    const nextTelemetry = recordVoiceTelemetry(telemetry, message, receivedAt);
    if (nextTelemetry === telemetry) return;
    telemetry = nextTelemetry;
    telemetryListener(telemetry);
  };

  const flushResults = () => {
    if (!pendingResults.length || socket?.readyState !== WebSocket.OPEN) return;
    if (!replyDone || userSpeaking || redirectPending) {
      if (!userSpeaking && !redirectPending) armReplyProgressTimer(currentReplyId);
      return;
    }
    const ready = pendingResults;
    pendingResults = [];
    // Sending one result does not start a reply. Parallel tools may settle at
    // different times, and the service can wait for all of them. Only an
    // incoming reply/speech start closes this delivery boundary.
    // Results generate another reply. Release them only at an uninterrupted
    // turn boundary; obsolete/cancelled continuations have no playback permit.
    ready.forEach(({ callId, execution, inputVersion: version }) => {
      // A duplicate navigation acknowledgment is already owned by the local
      // confirmation. It must not reserve a reply slot for the next request.
      if (execution.result !== navigationConfirmation?.result) expectToolReply(callId, version, execution.result.status === "interrupted");
      socket?.send(JSON.stringify({
        type: "tool.result", call_id: callId, result: JSON.stringify(execution.result), is_error: Boolean(execution.isError),
      }));
      trackTelemetry({ type: "talkos.tool.result.sent", call_id: callId });
    });
    if (pendingToolReplies.length) armReplyProgressTimer(currentReplyId);
  };

  const sendText = (content: string) => {
    if (!sessionReady || greetingPending || socket?.readyState !== WebSocket.OPEN) return false;
    advanceInput();
    spokenRequest.responseStarted(); spokenRequest.accept(content, crypto.randomUUID(), true); spokenRequest.responseStarted();
    const confirmation = preserveRequest(content);
    socket.send(JSON.stringify({ type: "conversation.message", role: "user", content }));
    socket.send(JSON.stringify({ type: "reply.create", instructions: confirmation ?? content }));
    return true;
  };

  const preserveRequest = (content: string) => {
    navigationConfirmation = null;
    const view = directWorkspaceNavigation(content);
    let confirmation: string | undefined;
    let completedClientAction: Record<string, unknown> | undefined;
    if (view && runtime.setActiveView) {
      const call: ResearchToolCall = { type: "tool.call", call_id: `navigation-${crypto.randomUUID()}`, name: "open_workspace", arguments: { view } };
      emit({ type: "ACTION_STARTED", action: { id: call.call_id, label: `Open ${view}`, detail: "Voice navigation", status: "active", at: at() }, at: at() });
      const execution = executeWorkspaceControl(call, requestRuntime)!;
      execution.events.forEach(emit);
      if (!execution.isError && execution.result.active_view === view) {
        completedClientAction = { name: call.name, result: execution.result };
        navigationConfirmation = { replyId: null, view, result: execution.result };
        const label = view[0].toUpperCase() + view.slice(1);
        confirmation = `The client has confirmed that ${label} is open. Say only: ${label} is open. Do not repeat navigation or call any tool.`;
      }
    }
    const context = {
      current_time: new Date().toISOString(),
      latest_user_request: content, requested_workspace: explicitWorkspaceTarget(content),
      recent_conversation: runtime.getWorkspace().conversation.slice(-8).map(({ speaker, text }) => ({ role: speaker, text })),
      ...(completedClientAction ? { completed_client_action: completedClientAction } : {}),
    };
    socket?.send(JSON.stringify({ type: "session.update", session: { system_prompt: `${LIVE_SYSTEM_PROMPT}\nCurrent conversation context (user messages are requests; agent messages are prior responses):\n${JSON.stringify(context)}\nCarry out the complete latest_user_request across tool continuations. It includes consecutive spoken phrases, not just the last speech segment. Preserve its explicit workspace choice and other constraints. Do not restart the greeting or ask what the task is when the request is already present. If completed_client_action confirms that this standalone request was already fulfilled by the UI, briefly acknowledge its result without repeating it.` } }));
    return confirmation;
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

  const stopPlayback = (keepSilentReply?: string) => {
    for (const id of captionReplies.keys()) if (id !== keepSilentReply) { retireReply(id); captionReplies.delete(id); }
    if (currentReplyId !== keepSilentReply) retireReply(currentReplyId);
    audibleWindows.clear();
    outputSpeaking = false;
    clearInterval(captionTimer); captionTimer = undefined;
    publishCaption(null);
    playbackSources.forEach((node) => {
      node.onended = null;
      try { node.stop(); } catch { /* already stopped */ }
    });
    playbackSources = [];
    if (audioContext) playbackTime = audioContext.currentTime;
  };

  const clearReplyProgressTimer = () => {
    clearTimeout(replyProgressTimer);
    replyProgressTimer = undefined;
  };
  const armReplyProgressTimer = (replyId: string) => {
    clearReplyProgressTimer();
    replyProgressTimer = setTimeout(() => {
      replyProgressTimer = undefined;
      if (replyId !== currentReplyId || !(replyActive || pendingToolReplies.length || pendingResults.length) || userSpeaking) return;
      if (activeCalls.size || playbackSources.length || localPausePending) { armReplyProgressTimer(replyId); return; }
      void cleanup();
      emit({ type: "SESSION_ERROR", message: "The voice agent stopped responding. Your saved workspace is still available. Tap the orb to reconnect, then ask it to continue from the saved research or document.", at: at() });
    }, REPLY_PROGRESS_TIMEOUT_MS);
  };

  const resumeLocalPause = () => {
    clearTimeout(localPauseTimer);
    localPauseTimer = undefined;
    if (!localPausePending) return;
    localPausePending = false;
    const context = audioContext;
    void context?.resume().then(() => {
      if (audioContext !== context) return;
      outputSpeaking = false;
      tickCaptions();
    }).catch(() => {});
  };
  const pauseForLocalSpeech = () => {
    if (!audioContext || localPausePending) return;
    localPausePending = true;
    localSpeechLatched = true;
    localSpeechFrames = 0;
    // The microphone has a separate clock, so it continues feeding the
    // provider while output and captions pause at their exact position.
    void audioContext.suspend().catch(resumeLocalPause);
    emit({ type: "VOICE_STATE_CHANGED", voiceState: "listening", at: at() });
    localPauseTimer = setTimeout(resumeLocalPause, 800);
  };

  const beginInterruption = () => {
    const firstSignal = !userSpeaking;
    userSpeaking = true;
    localSpeechFrames = 0;
    if (firstSignal) {
      responsePermit += 1;
      replyDone = false;
    }
    if (redirectPending) return;
    const interruptedActionId = [...activeActionIds].at(-1) ?? pendingResults.at(-1)?.callId;
    const interruptsActiveWork = replyActive || Boolean(interruptedActionId) || playbackSources.length > 0;
    if (!interruptsActiveWork) return;
    clearReplyProgressTimer();
    stopPlayback(replyActive && unspokenReplyIds.has(currentReplyId) ? currentReplyId : undefined);
    resumeLocalPause();
    if (navigationConfirmation) navigationConfirmation.replyId = null;
    redirectedActionId = interruptedActionId;
    redirectPending = true;
    trackTelemetry({ type: "talkos.interruption.candidate" });
    emit({ type: "INTERRUPTION_STARTED", actionId: interruptedActionId, at: at() });
    generation += 1;
    activeActionIds.forEach(cancelTool);
    activeCalls.forEach((controller) => controller.abort());
    activeCalls.clear();
    activeActionIds.clear();
  };

  const cleanup = async () => {
    connectionGeneration += 1;
    generation += 1;
    tokenController?.abort();
    clearTimeout(readyTimeout);
    clearReplyProgressTimer();
    clearTimeout(localPauseTimer);
    localPausePending = false;
    activeCalls.forEach((controller) => controller.abort());
    activeCalls.clear();
    sessionReady = false;
    greetingPending = false;
    stopPlayback();
    worklet?.disconnect();
    source?.disconnect();
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
    worklet = null;
    source = null;
    const oldSocket = socket;
    socket = null;
    if (oldSocket?.readyState === WebSocket.OPEN) oldSocket.send(JSON.stringify({ type: "session.end" }));
    oldSocket?.close();
    const oldAudioContext = audioContext;
    audioContext = null;
    const oldMicrophoneContext = microphoneContext;
    microphoneContext = null;
    pendingResults = [];
    pendingToolReplies.length = 0;
    toolReplyVersions.clear();
    replyPermits.clear();
    spokenReplies.clear();
    finishedReplyIds.clear();
    responsePermit = 0;
    inputVersion = 0;
    pendingText = [];
    replyActive = false;
    userSpeaking = false;
    navigationConfirmation = null;
    redirectPending = false;
    redirectedActionId = undefined;
    levelListener(0);
    lastLevelAt = -Infinity;
    activeActionIds.clear();
    handledCallIds.clear();
    retiredReplyIds.clear();
    unspokenReplyIds.clear();
    currentReplyId = "";
    incomingReplyId = "";
    localSpeechFrames = 0;
    localSpeechLatched = false;
    localQuietFrames = 0;
    spokenRequest = new SpokenRequest();
    if (oldAudioContext && oldAudioContext.state !== "closed") await oldAudioContext.close();
    if (oldMicrophoneContext && oldMicrophoneContext.state !== "closed") await oldMicrophoneContext.close();
  };

  return {
    async connect(nextEmit) {
      const thisConnection = ++connectionGeneration;
      tokenController = new AbortController();
      emit = nextEmit;
      emit({ type: "VOICE_STATE_CHANGED", voiceState: "connecting", at: at() });
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const region = timeZone.startsWith("Europe/") ? "eu" : "us";
      const response = await fetch("/api/voice-token", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(credentials ? { apiKey: credentials.apiKey, agentId: credentials.agentId } : {}), region }),
        signal: tokenController.signal,
      });
      if (thisConnection !== connectionGeneration) return;
      if (response.status === 503) throw new VoiceNotConfiguredError();
      if (!response.ok) throw new Error("The AssemblyAI session could not be started.");
      const sessionCredentials = (await response.json()) as { token: string; region?: "us" | "eu" };
      if (thisConnection !== connectionGeneration) return;

      audioContext = new AudioContext({ latencyHint: "interactive" });
      await audioContext.resume();
      if (thisConnection !== connectionGeneration) return;

      const voiceHost = sessionCredentials.region === "eu" ? "agents.eu.assemblyai.com" : "agents.assemblyai.com";
      const url = new URL(`wss://${voiceHost}/v1/ws`);
      url.searchParams.set("token", sessionCredentials.token);
      socket = new WebSocket(url);
      readyTimeout = setTimeout(() => {
        if (thisConnection !== connectionGeneration || sessionReady) return;
        void cleanup();
        emit({ type: "SESSION_ERROR", message: "The voice connection timed out. Try connecting again.", at: at() });
      }, 20_000);
      socket.addEventListener("open", () => {
        if (thisConnection !== connectionGeneration) return;
        greetingPending = pendingText.length === 0;
        socket?.send(JSON.stringify({
          type: "session.update",
          session: {
            ...(greetingPending ? { greeting: LIVE_GREETING } : {}),
            system_prompt: LIVE_SYSTEM_PROMPT,
            input: VOICE_INPUT_CONFIG,
            tools: workspaceTools,
          },
        }));
      });
      socket.addEventListener("message", (event) => {
        if (thisConnection !== connectionGeneration) return;
        let message: AssemblyAIEvent;
        try { message = JSON.parse(String(event.data)) as AssemblyAIEvent; } catch { return; }
        if (!message || typeof message !== "object") return;
        trackTelemetry(message);
        if (message.type === "reply.started") {
          replyDone = false;
          incomingReplyId = typeof message.reply_id === "string" ? message.reply_id : crypto.randomUUID();
          finishedReplyIds.delete(incomingReplyId);
          replyPermits.set(incomingReplyId, responsePermit);
          while (replyPermits.size > 256) replyPermits.delete(replyPermits.keys().next().value!);
        }
        const messageReplyId = typeof message.reply_id === "string" ? message.reply_id : incomingReplyId || currentReplyId;
        if (message.type === "reply.started" && pendingToolReplies.length) {
          // Tool results auto-start replies. Some deployments expose fc-call_id;
          // others use opaque resp_ ids and preserve the result/reply order.
          const matchingCall = pendingToolReplies.findIndex(reply => messageReplyId === `fc-${reply.callId}`);
          // Opaque reply ids can acknowledge an entire parallel tool batch.
          // Leaving one FIFO slot per result would mislabel the next user turn.
          const owners = matchingCall >= 0 ? pendingToolReplies.splice(matchingCall, 1) : pendingToolReplies.splice(0);
          const owner = owners.reduce((chosen, candidate) => candidate.inputVersion > chosen.inputVersion || candidate.inputVersion === chosen.inputVersion && (!candidate.cancelled || chosen.cancelled) ? candidate : chosen);
          toolReplyVersions.set(messageReplyId, owner.inputVersion);
          replyPermits.set(messageReplyId, owner.permit);
          if (owner.cancelled || owner.inputVersion < inputVersion) retireReply(messageReplyId);
        }
        if (message.type === "reply.started") {
          const chosen = spokenReplies.get(replyPermits.get(messageReplyId) ?? responsePermit);
          if (chosen && chosen !== messageReplyId) retireReply(messageReplyId);
        }
        const replyEvent = message.type?.startsWith("reply.") || message.type?.startsWith("transcript.agent");
        if (message.type === "reply.done") {
          finishedReplyIds.add(messageReplyId);
          while (finishedReplyIds.size > 100) finishedReplyIds.delete(finishedReplyIds.values().next().value!);
        }
        if (replyEvent && navigationConfirmation?.replyId && messageReplyId && navigationConfirmation.replyId !== messageReplyId) retireReply(messageReplyId);
        if (message.type === "reply.done") {
          const ownsCurrentReply = !currentReplyId || messageReplyId === currentReplyId;
          const ownsBoundary = !incomingReplyId || messageReplyId === incomingReplyId;
          unspokenReplyIds.delete(messageReplyId);
          captionReplies.get(messageReplyId)?.finish();
          tickCaptions();
          if (ownsBoundary) replyDone = true;
          if (ownsCurrentReply) {
            replyActive = false;
            clearReplyProgressTimer();
          }
          // A retired newest reply still carries a boundary. An older or
          // duplicate completion cannot reopen delivery during a newer reply.
          if (message.status === "interrupted") {
            if (ownsBoundary) pendingResults = [];
            if (ownsCurrentReply) stopPlayback();
          } else if (ownsBoundary) {
            flushResults();
          }
          if (greetingPending && ownsBoundary) { greetingPending = false; flushText(); }
        }
        if (replyEvent && retiredReplyIds.has(messageReplyId)) {
          // Old content cannot own playback or UI state. Its completion was
          // still handled above because tool continuations depend on it.
          return;
        }
        if (message.type === "reply.done" && messageReplyId && currentReplyId && messageReplyId !== currentReplyId) {
          return;
        }
        const resumingUnspokenReply = unspokenReplyIds.has(messageReplyId) && (message.type === "reply.audio" || message.type?.startsWith("transcript.agent"));
        if ((message.type === "reply.started" || resumingUnspokenReply) && redirectPending && !userSpeaking) {
          redirectPending = false; redirectedActionId = undefined;
        }
        if ((message.type === "reply.audio" || message.type?.startsWith("transcript.agent")) && (redirectPending || userSpeaking)) {
          // While a user continues a phrase, the provider may keep its existing
          // silent reply. Count discarded PCM for word offsets without playing it.
          if (message.type === "reply.audio" && typeof message.data === "string" && audioContext && unspokenReplyIds.has(messageReplyId)) {
            const samples = decodePcm16(message.data);
            if (samples.every(sample => Math.abs(sample) <= AUDIBLE_SAMPLE_THRESHOLD)) {
              replyCaptions(message).addAudio(audioContext.currentTime, samples.length / 24000);
              return;
            }
          }
          retireReply(messageReplyId); return;
        }
        if (message.type === "session.ready" && socket?.readyState === WebSocket.OPEN) {
          sessionReady = true;
          clearTimeout(readyTimeout);
          flushText();
        }
        if (message.type === "session.error" || message.type === "error" || message.type === "session.ended") {
          sessionReady = false;
        }
        if (message.type === "reply.audio" && typeof message.data === "string" && audioContext) {
          const samples = decodePcm16(message.data);
          const firstSound = samples.findIndex(sample => Math.abs(sample) > AUDIBLE_SAMPLE_THRESHOLD);
          if (firstSound >= 0 && !acceptSpokenReply(messageReplyId)) return;
          if (firstSound >= 0) { unspokenReplyIds.delete(messageReplyId); chooseNavigationReply(messageReplyId); }
          if (outputSpeaking) publishLevel(floatLevel(samples));
          const buffer = audioContext.createBuffer(1, samples.length, 24000);
          buffer.getChannelData(0).set(samples);
          const playback = audioContext.createBufferSource();
          playback.buffer = buffer;
          playback.connect(audioContext.destination);
          playbackTime = Math.max(playbackTime, audioContext.currentTime);
          const window = audibleWindows.get(messageReplyId);
          if (window) window.end = playbackTime + buffer.duration;
          else if (firstSound >= 0) audibleWindows.set(messageReplyId, { start: playbackTime + firstSound / 24000, end: playbackTime + buffer.duration });
          if (telemetry.awaitingResponse) {
            if (firstSound >= 0) trackTelemetry({ type: "talkos.playback.started" }, Date.now() + (playbackTime - audioContext.currentTime + firstSound / 24000) * 1000);
          }
          replyCaptions(message).addAudio(playbackTime, buffer.duration);
          playback.start(playbackTime);
          playbackTime += buffer.duration;
          playbackSources.push(playback);
          if (messageReplyId === currentReplyId && replyActive) armReplyProgressTimer(messageReplyId);
          playback.onended = () => {
            playbackSources = playbackSources.filter((item) => item !== playback);
            if (!playbackSources.length) {
              levelListener(0);
              if (!replyActive && !redirectPending) emit({ type: "VOICE_STATE_CHANGED", voiceState: activeCalls.size || pendingResults.length ? "acting" : pendingToolReplies.length ? "thinking" : "listening", at: at() });
            }
            tickCaptions();
          };
          syncSpeaking();
        }
        if (message.type === "reply.started") {
          if (currentReplyId !== messageReplyId && unspokenReplyIds.has(currentReplyId)) {
            retireReply(currentReplyId); captionReplies.delete(currentReplyId);
          }
          currentReplyId = messageReplyId;
          unspokenReplyIds.add(currentReplyId);
          replyDone = false;
          replyActive = true;
          armReplyProgressTimer(currentReplyId);
        }
        if (message.type === "transcript.agent.delta" && typeof message.delta === "string") {
          if (message.delta.trim() && !acceptSpokenReply(messageReplyId)) return;
          if (message.delta.trim()) { unspokenReplyIds.delete(messageReplyId); chooseNavigationReply(messageReplyId); }
          replyCaptions(message).addWord(message.delta, message.start_ms, message.end_ms);
          tickCaptions();
        }
        if (message.type === "transcript.agent" && typeof message.text === "string" && message.text.trim()) {
          if (!acceptSpokenReply(messageReplyId)) return;
          unspokenReplyIds.delete(messageReplyId); chooseNavigationReply(messageReplyId);
          const captions = captionReplies.get(messageReplyId);
          captions?.setText(message.text);
          // The final transcript follows all reply.audio frames. It is enough
          // to close the caption timeline if reply.done is delayed or lost.
          captions?.finish();
          tickCaptions();
          if (messageReplyId === currentReplyId) {
            replyActive = false;
            clearReplyProgressTimer();
            if (activeCalls.size || pendingResults.length || pendingToolReplies.length) armReplyProgressTimer(currentReplyId);
            if (!playbackSources.length && !userSpeaking) {
              emit({ type: "VOICE_STATE_CHANGED", voiceState: activeCalls.size || pendingResults.length ? "acting" : pendingToolReplies.length ? "thinking" : "listening", at: at() });
            }
          }
        }
        if (message.type === "input.speech.stopped" || message.type === "transcript.user") {
          userSpeaking = false;
          localSpeechFrames = 0;
          localSpeechLatched = false;
        }
        if (message.type === "input.speech.started") {
          beginInterruption();
        }
        // Tool replies can stream seconds of silence before any spoken answer.
        // Those buffers must not split the user's next phrase into a new task.
        // Network words often arrive before speech. Only audible playback (or
        // a completed text-only reply) ends the user's continued request.
        if (message.type === "transcript.agent" && message.interrupted !== true && !redirectPending && !userSpeaking && messageReplyId === currentReplyId && !captionReplies.has(messageReplyId)) spokenRequest.responseStarted();
        let userTranscript: SessionEvent | null = null;
        const isUserTranscript = message.type === "transcript.user" || message.type === "transcript.user.delta";
        if (isUserTranscript && typeof message.text === "string") {
          const final = message.type === "transcript.user";
          const request = spokenRequest.accept(message.text, typeof message.item_id === "string" ? message.item_id : undefined, final);
          if (request) {
            if (!final) { userSpeaking = true; replyDone = false; }
            userTranscript = final ? { type: "TALK_TURN_FINALIZED", speaker: "user", ...request, at: at() } : { type: "TRANSCRIPT_PARTIAL", speaker: "user", ...request, replace: true, at: at() };
            if (final) {
              advanceInput();
              const confirmation = preserveRequest(request.text);
              if (confirmation && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "reply.create", instructions: confirmation }));
            }
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
          if (handledCallIds.has(call.call_id)) return;
          clearReplyProgressTimer();
          handledCallIds.add(call.call_id);
          if (userSpeaking || redirectPending) { cancelTool(call.call_id); return; }
          if (navigationConfirmation && call.name === "open_workspace" && call.arguments.view === navigationConfirmation.view) {
            // The UI already opened this tab. A delayed automatic call must not
            // navigate again, duplicate its ledger entry or leave Working stuck.
            pendingResults.push({ callId: call.call_id, execution: { result: navigationConfirmation.result, events: [] }, inputVersion });
            flushResults();
            return;
          }
          const callGeneration = generation;
          const callInputVersion = inputVersion;
          const controller = new AbortController();
          activeCalls.add(controller);
          activeActionIds.add(call.call_id);
          void executeResearchTool(call, requestRuntime, controller.signal).then((execution) => {
            activeCalls.delete(controller);
            activeActionIds.delete(call.call_id);
            if (controller.signal.aborted || callGeneration !== generation) return;
            trackTelemetry({ type: "talkos.tool.completed", call_id: call.call_id, name: call.name, status: execution.isError ? "failed" : "completed" });
            spokenRequest.actionResponded();
            execution.events.forEach((normalizedEvent) => emit(normalizedEvent));
            pendingResults.push({ callId: call.call_id, execution, inputVersion: callInputVersion });
            flushResults();
          }).catch((error: unknown) => {
            activeCalls.delete(controller);
            activeActionIds.delete(call.call_id);
            if (controller.signal.aborted || callGeneration !== generation) return;
            const detail = error instanceof Error ? error.message : "tool_failed";
            const execution: ResearchToolExecution = { events: [{ type: "ACTION_FAILED", actionId: call.call_id, detail, at: at() }], result: { error: detail }, isError: true };
            execution.events.forEach((normalizedEvent) => emit(normalizedEvent));
            pendingResults.push({ callId: call.call_id, execution, inputVersion: callInputVersion });
            flushResults();
          });
        }
        let normalized = isUserTranscript ? userTranscript : normalizeVoiceEvent(message);
        if (message.type === "reply.done" && message.status !== "interrupted" && !outputSpeaking) {
          normalized = { type: "VOICE_STATE_CHANGED", voiceState: activeCalls.size || pendingResults.length ? "acting" : pendingToolReplies.length ? "thinking" : "listening", at: at() };
        }
        // reply.done describes the network stream; buffered audio can still be
        // audible. Its onended callback returns the UI to listening.
        const audioStillSpeaking = (message.type === "reply.done" && message.status !== "interrupted" && playbackSources.length > 0) || (message.type === "reply.started" && outputSpeaking);
        if (normalized && !audioStillSpeaking) emit(normalized);
        if (normalized?.type === "ACTION_STARTED" && outputSpeaking) emit({ type: "VOICE_STATE_CHANGED", voiceState: "speaking", at: at() });
        if (["session.error", "error", "session.ended"].includes(message.type ?? "")) void cleanup();
      });
      socket.addEventListener("close", () => {
        if (thisConnection !== connectionGeneration) return;
        void cleanup();
        emit({ type: "CONNECTION_CHANGED", connected: false, mode: "live", at: at() });
      });
      socket.addEventListener("error", () => {
        if (thisConnection !== connectionGeneration) return;
        void cleanup();
        emit({ type: "SESSION_ERROR", message: "The live voice connection was interrupted. Check Settings and reconnect.", at: at() });
      });
    },

    async startListening() {
      const thisConnection = connectionGeneration;
      await audioContext?.resume();
      if (!audioContext || worklet) return;
      microphoneContext ??= new AudioContext({ latencyHint: "interactive" });
      const inputContext = microphoneContext;
      await inputContext.resume();
      await inputContext.audioWorklet.addModule("/pcm-processor.js");
      const acquiredStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: false } });
      if (thisConnection !== connectionGeneration || !audioContext) { acquiredStream.getTracks().forEach((track) => track.stop()); return; }
      stream = acquiredStream;
      source = inputContext.createMediaStreamSource(stream);
      const audioWorklet = new AudioWorkletNode(inputContext, "talkos-pcm-processor", {
        processorOptions: { inputSampleRate: inputContext.sampleRate, targetSampleRate: 24000 },
      });
      audioWorklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
        const inputLevel = pcmLevel(event.data);
        if (localPausePending && inputLevel >= LOCAL_BARGE_IN_LEVEL) {
          clearTimeout(localPauseTimer);
          localPauseTimer = setTimeout(resumeLocalPause, 800);
        }
        localQuietFrames = inputLevel < LOCAL_BARGE_IN_LEVEL / 2 ? localQuietFrames + 1 : 0;
        if (localQuietFrames >= 15) localSpeechLatched = false;
        if (outputSpeaking && !userSpeaking && !redirectPending && !localPausePending && !localSpeechLatched) {
          localSpeechFrames = inputLevel >= LOCAL_BARGE_IN_LEVEL ? localSpeechFrames + 1 : Math.max(0, localSpeechFrames - 1);
          if (localSpeechFrames >= LOCAL_BARGE_IN_FRAMES) pauseForLocalSpeech();
        } else {
          localSpeechFrames = 0;
        }
        if (!playbackSources.length) publishLevel(inputLevel);
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
      localSpeechFrames = 0;
      resumeLocalPause();
      levelListener(0);
    },

    submitText(text) {
      const content = text.trim();
      if (!content) return;
      if (!sendText(content)) pendingText.push(content);
    },

    setMuted(muted) {
      stream?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
      if (muted) { localSpeechFrames = 0; resumeLocalPause(); }
    },

    setLevelListener(listener) {
      levelListener = listener;
    },

    setTelemetryListener(listener) {
      telemetryListener = listener;
      telemetryListener(telemetry);
    },

    async disconnect() {
      await cleanup();
    },
  };
}
