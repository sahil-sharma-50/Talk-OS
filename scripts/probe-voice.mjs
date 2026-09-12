// Verify token creation and the stored-agent/tool handshake without using a microphone.
import { createServer } from 'vite';

const compiler = await createServer({ configFile: 'vitest.config.ts', server: { middlewareMode: true }, appType: 'custom' });
let tools;
let systemPrompt;
try {
  ({ workspaceTools: tools, LIVE_SYSTEM_PROMPT: systemPrompt } = await compiler.ssrLoadModule('/features/voice/research-tools.ts'));
} finally {
  await compiler.close();
}
const response = await fetch('http://localhost:3000/api/voice-token', {
  method: 'POST', headers: { 'content-type': 'application/json' },
});
console.log('token_status=' + response.status);
if (!response.ok) process.exit(1);
const credentials = await response.json();
const socket = new WebSocket('wss://agents.assemblyai.com/v1/ws?token=' + encodeURIComponent(credentials.token));
const timer = setTimeout(() => { console.log('timeout'); socket.close(); process.exitCode = 1; }, 12000);
let ready = false;
let toolsAccepted = false;
let audioReceived = false;
socket.onopen = () => socket.send(JSON.stringify({ type: 'session.update', session: { agent_id: credentials.agentId } }));
socket.onmessage = (event) => {
  const message = JSON.parse(String(event.data));
  if (message.type !== 'reply.audio' && !message.type.endsWith('.delta')) {
    console.log(JSON.stringify({ type: message.type, code: message.code, message: message.message }));
  }
  if (message.type === 'session.ready') {
    ready = true;
    socket.send(JSON.stringify({ type: 'session.update', session: { tools, system_prompt: systemPrompt } }));
  }
  if (message.type === 'session.updated' && ready) {
    toolsAccepted = true;
    console.log('tools_accepted=' + tools.length);
  }
  if (message.type === 'reply.audio' && message.data && !audioReceived) {
    audioReceived = true;
    console.log('greeting_audio_received=true');
  }
  if (toolsAccepted && audioReceived) {
    toolsAccepted = false;
    socket.send(JSON.stringify({ type: 'session.end' }));
  }
  if (['session.error', 'error'].includes(message.type)) {
    process.exitCode = 1;
    clearTimeout(timer);
    socket.close();
  }
  if (message.type === 'session.ended') { clearTimeout(timer); socket.close(); }
};
socket.onerror = () => { clearTimeout(timer); console.log('websocket_error'); process.exitCode = 1; };
