# TalkOS

TalkOS is a live, voice-operated vendor-research workspace. Speak to an AI agent while it gathers evidence, interrupt it while it works, and watch the plan change before it produces a cited decision brief.

The hackathon prototype focuses on one memorable behavior: immediate, visible replanning after a spoken interruption.

## Run locally

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. **Run the demo** works without credentials or external research services.

## Live AssemblyAI voice

Copy `.env.example` to `.env.local` and set:

```text
ASSEMBLYAI_API_KEY=your_server_side_key
ASSEMBLYAI_AGENT_ID=your_published_voice_agent_id
```

Create the stored agent in AssemblyAI with a concise research-assistant prompt. The prompt should tell the agent to use the session's client-side research tools, never invent source results, and keep spoken replies to one or two sentences. TalkOS registers these tools when the browser session connects:

- `search_sources`
- `open_source`
- `capture_finding`
- `write_decision_brief`

Select **Start live voice** and allow microphone access. The server mints a single-use AssemblyAI credential valid for 120 seconds; the long-lived API key is never sent to the browser. TalkOS uses echo cancellation, browser-rate audio capture resampled to 24 kHz PCM16, streamed transcripts, streamed audio playback, automatic barge-in handling, and a clean `session.end` teardown.

Live microphone sessions require HTTPS or `localhost`.

## Judging demo

The deterministic path lasts roughly nine seconds once the actions begin:

1. Select **Run the demo**.
2. Let TalkOS begin the broad Supabase/Firebase comparison.
3. Select **Interrupt agent** while “Scanning the open web” is active.
4. Point out the struck-through action, coral interrupted state, citron **Plan revised** marker, and new official-source constraint.
5. Watch four official-source findings enter the source stack.
6. TalkOS switches to Notes and presents a cited recommendation reflecting the revised brief.

For the submission video, deliver the same correction by voice in live mode:

> “Wait—use official sources only. Prioritize compliance and pricing under one hundred dollars.”

## Architecture

- `features/session`: pure reducer and normalized event contract.
- `features/demo`: cancellable, deterministic judging sequence and curated demo evidence.
- `features/voice`: AssemblyAI browser audio adapter, event normalization, and client-side research tool execution.
- `app/api/voice-token`: server-only temporary token endpoint.
- `components/talkos`: accessible voice panel, action ledger, research browser, and decision notes.

Both live and demo paths update the same session reducer. Stale completion events from an interrupted action are rejected by action ID.

## Safety and evidence

This prototype is read-only. It does not submit forms, make purchases, authenticate to third-party sites, execute terminal commands, or control the user's computer. The included vendor findings are explicitly marked as demo data and link to the corresponding official provider pages; confirm current commercial details before making a real purchasing decision.

## Verification

```powershell
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

