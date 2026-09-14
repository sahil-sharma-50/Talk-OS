// Opt-in integration probe. Uses configured providers but keeps artifacts in
// memory; never reads or changes the user's saved browser workspace.
import { createServer } from 'vite';

const origin = process.env.TALKOS_PROBE_ORIGIN || 'http://localhost:3000';
const compiler = await createServer({ configFile: 'vitest.config.ts', server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const nativeFetch = globalThis.fetch;
const NativeSocket = globalThis.WebSocket;
const started = Date.now();
const log = (entry) => console.log(JSON.stringify({ ms: Date.now() - started, ...entry }));
let latestType;
let audioSeconds = 0;
let timer;
let adapter;
let closing = false;
let submitted = false;
let micPort;
let micTimer;
let failedResultSent = false;
let greetingFinished = false;
let inputFinished = false;
let spokeDuringInput = false;
let lastUserText = '';
let firstInputSoundAt;
const partialTimes = [];
const captionProbe = process.argv.includes('--caption-probe');
const failureMode = process.argv.includes('--fail-research');
const researchOnly = process.argv.includes('--research-only');
const pauseSpeech = process.argv.includes('--pause-speech');
const speechMode = process.argv.includes('--speech') || pauseSpeech || captionProbe;
const requestParts = ["Uh yeah, I'm thinking of building an Android app. Just like", "Instagram, and I want you to do market research. Find the direction where I can build this app. Also research what target audience I should be aiming for."];
const request = process.env.TALKOS_PROBE_REQUEST || (researchOnly || pauseSpeech ? requestParts.join(' ') : "Do market research for a new Android social media app like Instagram. Recommend my target audience and what differentiated product I should build, then put the research and recommendations into a sourced PRD document. Use the current year.");

async function synthesizeRequest(text = request) {
  const response = await nativeFetch(`${origin}/api/voice-token`, { method: 'POST' });
  if (!response.ok) throw new Error(`speech_token_${response.status}`);
  const { token, region } = await response.json();
  return new Promise((resolve, reject) => {
    const socket = new NativeSocket(`wss://${region === 'eu' ? 'agents.eu.assemblyai.com' : 'agents.assemblyai.com'}/v1/ws?token=${encodeURIComponent(token)}`);
    const chunks = [];
    const deadline = setTimeout(() => { socket.close(); reject(new Error('speech_generation_timeout')); }, 45_000);
    socket.onopen = () => socket.send(JSON.stringify({ type: 'session.update', session: { greeting: text, system_prompt: 'Read the greeting exactly as written.', tools: [] } }));
    socket.onmessage = ({ data }) => {
      const m = JSON.parse(String(data));
      if (m.type === 'reply.audio') chunks.push(Buffer.from(m.data, 'base64'));
      if (m.type === 'reply.done') {
        clearTimeout(deadline);
        socket.send(JSON.stringify({ type: 'session.end' })); socket.close();
        const pcm = Buffer.concat(chunks);
        log({ inputAudioSeconds: pcm.length / 48000 }); resolve(pcm);
      }
    };
    socket.onerror = () => { clearTimeout(deadline); reject(new Error('speech_socket_failed')); };
  });
}

globalThis.fetch = async (url, options) => {
  if (failureMode && String(url) === '/api/research') return Response.json({ error: 'Research provider temporarily unavailable' }, { status: 502 });
  const response = await nativeFetch(new URL(url, origin), options);
  if (String(url) === '/api/research' && process.argv.includes('--delay-research')) await new Promise(resolve => setTimeout(resolve, 22_000));
  return response;
};
globalThis.WebSocket = class extends NativeSocket {
  constructor(url) {
    super(url);
    this.addEventListener('message', ({ data }) => {
      const m = JSON.parse(String(data));
      latestType = m.type;
      if (m.type === 'reply.audio') { audioSeconds += Buffer.from(m.data, 'base64').length / 48000; return; }
      if (m.type?.endsWith('.delta') && !(captionProbe && m.type === 'transcript.user.delta')) return;
      log({ direction: 'in', type: m.type, reply_id: m.reply_id, item_id: m.item_id, call_id: m.call_id, name: m.name, arguments: ['search_web', 'read_sources', 'summarize_research', 'create_document'].includes(m.name) ? m.arguments : undefined, status: m.status, interrupted: m.interrupted, text: m.text, code: m.code, message: m.message });
    });
  }
  send(data) {
    const m = JSON.parse(data);
    if (m.type !== 'input.audio') {
      const result = m.type === 'tool.result' ? JSON.parse(m.result) : undefined;
      if (m.type === 'tool.result' && m.is_error === true) failedResultSent = true;
      log({ direction: 'out', type: m.type, call_id: m.call_id, after: latestType, is_error: m.is_error, result_keys: result && Object.keys(result), error: result?.error, sources: result?.sources?.length, bytes: data.length });
    }
    super.send(data);
  }
};
globalThis.AudioContext = class {
  state = 'running'; destination = {}; epoch = performance.now(); pausedAt = 0;
  sampleRate = 24000; audioWorklet = { addModule: async () => {} };
  createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  get currentTime() { return ((this.state === 'suspended' ? this.pausedAt : performance.now()) - this.epoch) / 1000; }
  async suspend() { this.pausedAt = performance.now(); this.state = 'suspended'; }
  async resume() { if (this.state === 'suspended') this.epoch += performance.now() - this.pausedAt; this.state = 'running'; }
  async close() { this.state = 'closed'; }
  createBuffer(channels, length, rate) { return { duration: length / rate, getChannelData: () => new Float32Array(length) }; }
  createBufferSource() {
    const playbackTime = () => this.currentTime;
    return { buffer: null, onended: null, timer: null, connect() {}, disconnect() {},
      start(at) { this.timer = setTimeout(() => this.onended?.(), Math.max(0, at + this.buffer.duration - playbackTime()) * 1000); },
      stop() { clearTimeout(this.timer); },
    };
  }
};
globalThis.AudioWorkletNode = class { port = { onmessage: null }; constructor() { micPort = this.port; } disconnect() {} };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }], getAudioTracks: () => [] }) } } });
try {
  const { createAssemblyAIAdapter } = await compiler.ssrLoadModule('/features/voice/assemblyai-adapter.ts');
  const { createWorkspace } = await compiler.ssrLoadModule('/features/workspace/workspace-model.ts');
  let workspace = { ...createWorkspace(), documents: [], activeDocumentId: "" };
  const pcm = pauseSpeech ? Buffer.concat([await synthesizeRequest(requestParts[0]), Buffer.alloc(1200 * 48), await synthesizeRequest(requestParts[1])]) : speechMode ? await synthesizeRequest() : null;
  const finish = async (reason) => {
    if (closing) return;
    closing = true;
    clearTimeout(timer);
    clearInterval(micTimer);
    const document = workspace.documents.at(-1);
    const summaries = workspace.researchCollections.filter(collection => collection.summary?.trim()).length;
    log({ reason, documents: workspace.documents.length, sources: workspace.sources.length, summaries, audioSeconds: Math.round(audioSeconds), document: document && { title: document.title, characters: document.content.length, hasLinks: /\]\(https?:\/\//.test(document.content) } });
    const citedDocument = document && workspace.sources.length && /\]\(https?:\/\//.test(document.content);
    const completed = reason === 'research-compiled-and-confirmed' && summaries || reason === 'document-created-and-confirmed' && citedDocument;
    log({ spokeDuringInput, inputFinished, lastUserText, partials: partialTimes.length, firstPartialMs: partialTimes.length && firstInputSoundAt ? partialTimes[0] - firstInputSoundAt : null });
    process.exitCode = captionProbe ? Number(reason !== 'captions-measured' || partialTimes.length < 3) : failureMode ? Number(reason !== 'failure-acknowledged') : Number(!completed || pauseSpeech && (spokeDuringInput || !/Instagram/i.test(lastUserText) || !/target audience/i.test(lastUserText)));
    await adapter?.disconnect();
    await compiler.close();
  };
  adapter = createAssemblyAIAdapter(undefined, {
    getWorkspace: () => workspace,
    setWorkspace: next => { workspace = next; log({ workspace: { documents: next.documents.length, sources: next.sources.length } }); },
    getTavilyApiKey: () => '',
    setActiveView: view => log({ view }),
  });
  if (!speechMode) adapter.submitText(request);
  timer = setTimeout(() => void finish('deadline'), 100_000);
  await adapter.connect(event => {
    if (event.type === 'VOICE_STATE_CHANGED') {
      log({ state: event.voiceState });
      if (submitted && pcm && !inputFinished && event.voiceState === 'speaking') spokeDuringInput = true;
    }
    if (event.type === 'TRANSCRIPT_PARTIAL' && event.speaker === 'user') { partialTimes.push(Date.now()); if (captionProbe) log({ displayedPartial: event.text }); }
    if (event.type === 'TALK_TURN_FINALIZED' && event.speaker === 'user') { lastUserText = event.text; if (captionProbe && inputFinished) void finish('captions-measured'); }
    if (event.type === 'ACTION_FAILED' || event.type === 'SESSION_ERROR') { log({ event }); if (event.type === 'SESSION_ERROR') void finish('session-error'); }
    // Wait for the greeting audio to drain before measuring a user's request.
    if (event.type === 'TALK_TURN_FINALIZED' && event.speaker === 'agent' && !submitted) greetingFinished = true;
    const ready = pcm ? greetingFinished && event.type === 'VOICE_STATE_CHANGED' && event.voiceState === 'listening' : event.type === 'CONNECTION_CHANGED' && event.connected;
    if (ready && !submitted) {
      submitted = true;
      if (pcm) void adapter.startListening().then(() => {
        let offset = 0;
        log({ inputStarted: true });
        micTimer = setInterval(() => {
          const frame = new Uint8Array(960);
          if (offset < pcm.length) frame.set(pcm.subarray(offset, offset + 960));
          if (!firstInputSoundAt && new Int16Array(frame.buffer).some(sample => Math.abs(sample) > 260)) firstInputSoundAt = Date.now();
          offset += 960;
          micPort.onmessage?.({ data: frame.buffer });
          if (!inputFinished && offset >= pcm.length) {
            inputFinished = true; log({ inputFinished: true });
            // A final transcript can precede the synthesized clip's trailing
            // silence. Caption measurement must not then wait for tool work.
            if (captionProbe) setTimeout(() => void finish('captions-measured'), 1500);
          }
        }, 20);
      });
    }
    if (submitted && event.type === 'TALK_TURN_FINALIZED' && event.speaker === 'agent') {
      if (failureMode && failedResultSent) void finish('failure-acknowledged');
      else if ((researchOnly || pauseSpeech) && workspace.researchCollections.some(collection => collection.summary?.trim())) void finish('research-compiled-and-confirmed');
      else if (workspace.documents.length) void finish('document-created-and-confirmed');
    }
  });
} catch (error) {
  clearTimeout(timer);
  log({ failure: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
  await adapter?.disconnect();
  await compiler.close();
}
