# PRD --- Voice Agent Workspace

**Working name:** TalkOS\
**Product type:** Browser-based AI workspace\
**Hackathon:** AssemblyAI Voice Agent Hackathon\
**Status:** MVP / Hackathon Prototype

## 1. Product Summary

TalkOS is an interactive sandbox where a user can **talk naturally to an
AI agent while watching it operate a virtual workspace**.

Instead of submitting a prompt and waiting for an autonomous agent to
finish, the user collaborates with the agent continuously through voice.

The agent can operate tools such as a browser, notepad, screenshots,
files, and optionally a terminal. While the agent works, the user can
interrupt, redirect, ask questions, stop actions, or give additional
instructions.

**Core idea:**

> A computer workspace you operate together with an AI through
> conversation.

The defining interaction is:

``` text
User speaks
     ↓
AssemblyAI realtime voice
     ↓
Agent understands intent
     ↓
Agent selects a tool
     ↓
Action occurs visibly in sandbox
     ↓
Agent observes result
     ↓
Agent continues reasoning
     ↓
User can interrupt at any point
```

## 2. Problem

Most AI agents currently work through a request-and-wait model:

``` text
Prompt → Agent works → Result
```

This creates several problems:

-   Users cannot easily intervene while an agent is working.
-   Users often do not know what the agent is doing.
-   Redirecting an agent requires another prompt cycle.
-   Computer-use agents can feel disconnected from the user.
-   Chat is not always the most natural interface while watching an
    agent work.

Human collaboration works differently. A user should be able to say:

> "Search for flights to Tokyo."

Then interrupt with:

> "Actually, only direct flights."

And later:

> "Open the second one."

TalkOS brings this **continuous conversational collaboration** to AI
computer-use agents.

## 3. Goal

Build a voice-first AI workspace where users can:

**Talk → Observe → Interrupt → Redirect → Continue**

without leaving the same interaction.

The agent should feel less like a chatbot and more like **someone
sitting beside the user operating a computer with them**.

## 4. Target User

For the hackathon MVP, the target user is a knowledge worker performing
browser-based research.

Potential users include:

-   Developers
-   Founders
-   Researchers
-   Students
-   Analysts
-   Product managers

The architecture should eventually support broader computer tasks.

## 5. Primary Use Case

### Voice-powered research assistant

User says:

> "Research whether I should use Supabase or Firebase for my SaaS."

The agent responds:

> "Sure. I'll compare their documentation, pricing and developer
> experience."

The workspace opens a browser and the agent begins researching.

While it is working, the user says:

> "Actually, focus on authentication and pricing."

The agent immediately adjusts its research plan.

The user can then say:

> "Open the Supabase pricing page."

The agent navigates there.

> "Take a screenshot of this."

The agent captures the current page.

> "Create a note comparing the two."

The agent opens Notepad and writes a structured comparison based on its
research.

Finally:

> "Which one would you choose?"

The agent provides a spoken recommendation grounded in the information
collected in the workspace.

## 6. Product Experience

The application consists of two primary areas:

``` text
┌────────────────────────┬────────────────────────────────────┐
│     VOICE AGENT        │             WORKSPACE              │
│                        │                                    │
│  ● Listening           │ Browser │ Notes │ Files │ Terminal │
│                        │ ────────────────────────────────── │
│  Conversation          │                                    │
│                        │       Agent-controlled             │
│  User                  │           workspace                │
│  "Research..."         │                                    │
│                        │                                    │
│  Agent                 │                                    │
│  "I'll look..."        │                                    │
│                        │                                    │
│  ───────────────────   │                                    │
│  ACTIVITY              │                                    │
│                        │                                    │
│  ✓ Opened browser      │                                    │
│  ✓ Searched web        │                                    │
│  ● Reading page        │                                    │
│                        │                                    │
│      🎙 Talk           │                                    │
└────────────────────────┴────────────────────────────────────┘
```

Approximately **25--30%** of the screen is dedicated to the voice agent,
while **70--75%** is dedicated to the workspace.

## 7. Voice Agent Panel

The left panel represents the agent.

### Agent State

Clearly communicate what the agent is doing.

Possible states:

``` text
○ Idle
● Listening
● Thinking
● Working
● Speaking
⏸ Waiting for user
```

A waveform or subtle animation should indicate active speech/listening.

### Conversation

Show a lightweight transcript:

``` text
YOU

Research Supabase vs Firebase.

AGENT

I'll compare the two.

YOU

Focus on authentication and pricing.

AGENT

Got it. I'll prioritize those.
```

The transcript is secondary to voice but provides transparency and
context.

### Activity

Show actions performed by the agent:

``` text
ACTIVITY

✓ Opened browser

✓ Google search
  "Supabase vs Firebase pricing"

✓ Opened Supabase pricing

● Reading documentation...

○ Compare findings
```

This gives the user visibility into agent behavior.

### Voice Controls

Primary control:

``` text
🎙 Hold to Talk
```

Potential additional controls:

-   Mute
-   Stop Agent
-   Pause

## 8. Workspace

The right side represents the agent's virtual computer.

The MVP contains three primary tools:

1.  Browser
2.  Notepad
3.  Screenshot

Files and Terminal can be stretch goals.

## 9. Browser

The browser should support basic agent-controlled navigation.

Potential tool interface:

``` text
browser.open(url)
browser.search(query)
browser.navigate(url)
browser.click(element)
browser.scroll(direction)
browser.extract()
browser.back()
browser.forward()
```

The user should visibly see navigation happening.

For the hackathon, browser functionality can run inside a controlled
remote browser rather than attempting to control the user's actual
browser.

## 10. Notepad

The agent should have persistent notes associated with the current
session.

Potential tools:

``` text
notes.create()
notes.read()
notes.write(content)
notes.append(content)
notes.replace(content)
```

Example:

``` text
Supabase vs Firebase

Authentication
--------------

Supabase
• ...

Firebase
• ...

Pricing
-------

Supabase
• ...

Firebase
• ...

Recommendation
--------------
...
```

The user should see text appearing as the agent writes.

## 11. Screenshot Tool

The agent should be capable of capturing its workspace.

Potential tools:

``` text
screenshot.capture()
screenshot.view()
screenshot.analyze()
```

Example interaction:

> "Take a screenshot."

The agent captures the browser.

Then:

> "What do you see?"

The screenshot can be sent to a multimodal model for analysis.

Eventually this could enable visual computer interaction such as:

> "Click the green button."

Precise vision-driven clicking is **not required for the initial MVP**.

## 12. Files

Files are a stretch goal for the hackathon MVP.

Potential interface:

``` text
files.create()
files.read()
files.write()
files.list()
```

Users could ask the agent to save research, read uploaded documents, or
create artifacts inside the workspace.

## 13. Terminal

Terminal access is an optional stretch goal.

Potential interface:

``` text
terminal.run(command)
terminal.read_output()
```

For safety, terminal execution should happen inside an isolated sandbox
with strict permissions and resource limits.

The terminal is not required for the primary hackathon demo.

## 14. Voice Architecture

AssemblyAI should be a core component of the interaction rather than
simply an add-on.

Suggested flow:

``` text
Microphone
    ↓
AssemblyAI Streaming / Voice Agent API
    ↓
Realtime transcription
    ↓
Turn detection
    ↓
Agent / LLM
    ↓
Tool selection
    ↓
Sandbox action
    ↓
Observation
    ↓
Agent reasoning
    ↓
Text-to-Speech
    ↓
User
```

Important voice capabilities:

-   Realtime speech recognition
-   Low-latency transcription
-   Turn detection
-   Barge-in / interruption
-   Continuous conversation
-   Spoken agent responses

## 15. Agent Loop

The agent follows an observe-reason-act loop.

``` text
User instruction
      ↓
Understand intent
      ↓
Create/update plan
      ↓
Select tool
      ↓
Execute action
      ↓
Observe result
      ↓
Update state
      ↓
Continue or respond
```

At every appropriate point, new user speech should be capable of
changing the active plan.

Example:

``` text
Agent:
Searching Firebase documentation...

User:
"Stop. Only use official documentation."

Agent:
Stops current search
Updates constraints
Continues using official sources only
```

This interruption model is one of the core differentiators of the
product.

## 16. Core Tool Schema

The agent can conceptually receive tools similar to:

``` text
browser_search
browser_open
browser_click
browser_scroll
browser_extract

notes_create
notes_write
notes_read

screenshot_capture
screenshot_analyze

agent_stop
agent_pause
```

The exact implementation can differ, but tools should expose structured
inputs and outputs to the agent.

## 17. Agent State

Maintain session-level state including:

``` text
conversation
current_task
current_plan
current_tool
browser_state
notes
screenshots
activity_history
```

This allows the agent to understand references such as:

> "Go back."

> "Open the second result."

> "Put that in the notes."

> "Take a screenshot of this."

## 18. Interruption Handling

Interruption is a first-class feature.

If the agent is speaking and the user begins talking:

``` text
Agent speech
     ↓
User starts speaking
     ↓
Stop TTS
     ↓
AssemblyAI transcribes user
     ↓
Agent receives interruption
     ↓
Current plan is reevaluated
```

Examples:

> "Stop."

> "Wait."

> "Don't click that."

> "Use the second result."

> "Ignore pricing."

> "Explain what you're doing."

This should feel immediate.

## 19. Safety and User Control

Actions that could have external consequences should require
confirmation.

Examples:

``` text
Sending email
Making purchases
Deleting files
Submitting forms
Publishing content
Running dangerous terminal commands
```

The workspace should clearly distinguish:

``` text
READ ACTION
No confirmation required

WRITE ACTION
May require confirmation

EXTERNAL / DESTRUCTIVE ACTION
Confirmation required
```

For the hackathon MVP, browser actions can be primarily read-only.

## 20. MVP Scope

### Must Have

-   Voice input
-   AssemblyAI integration
-   Realtime transcription
-   Spoken agent responses
-   Interruption / barge-in
-   Browser sandbox
-   Browser search/navigation
-   Notepad
-   Screenshot capture
-   Agent tool calling
-   Visible activity timeline
-   Session state

### Nice to Have

-   Screenshot vision analysis
-   Files
-   Multiple browser tabs
-   Browser history
-   Rich note editor
-   Session persistence
-   Shareable sessions

### Stretch Goals

-   Terminal
-   Full visual computer use
-   Authenticated websites
-   Email
-   Calendar
-   Multi-agent workflows
-   User's local computer control

## 21. Non-Goals for Hackathon MVP

Do **not** attempt to build:

-   A complete operating system
-   Full Chrome replacement
-   General desktop automation
-   Perfect visual clicking
-   Hundreds of integrations
-   Fully autonomous long-running agents
-   Production-grade security infrastructure

The hackathon version should prove the **voice + workspace collaboration
experience**.

## 22. Suggested Technical Architecture

``` text
                     ┌─────────────────┐
                     │   React/Next.js │
                     │       UI        │
                     └────────┬────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
       Voice Agent Panel                Workspace
              │                               │
              │                    ┌──────────┼──────────┐
              │                    │          │          │
              │                 Browser     Notes    Screenshots
              │
        Microphone
              │
              ↓
         AssemblyAI
              │
              ↓
        Agent Backend
              │
              ↓
             LLM
              │
              ↓
        Tool Router
              │
      ┌───────┼────────┐
      │       │        │
   Browser   Notes   Screenshot
```

Possible implementation:

**Frontend** - Next.js - React - WebSocket - Tailwind CSS

**Voice** - AssemblyAI Voice Agent API or Streaming STT

**Agent** - OpenAI / Claude / Gemini or AssemblyAI LLM Gateway -
Tool/function calling

**Browser** - Playwright - Isolated browser/container

**Notes** - Local/session database initially

**Vision** - Multimodal LLM

**Backend** - Node.js / TypeScript or Python

## 23. UX Principles

### Voice First

The user should be able to perform the main workflow without typing.

### Visible Actions

Never hide significant agent actions.

### Interruptible

The user should always feel capable of redirecting the agent.

### Fast Feedback

Immediately acknowledge voice input.

### Agent Explains When Needed

The agent should not narrate every trivial action, but users should be
able to ask:

> "What are you doing?"

### Workspace Persistence

Browser state, notes, screenshots and context should survive throughout
the session.

## 24. Hackathon Demo

Target demo length: **60--90 seconds**.

### Demo Scenario

User:

> "Research whether I should use Supabase or Firebase for my SaaS."

Agent:

> "I'll compare them."

Browser opens and begins searching.

User interrupts:

> "Actually, focus on authentication and pricing."

Agent immediately changes direction.

Agent opens official documentation.

User:

> "Open the Supabase pricing page."

Agent navigates there.

User:

> "Take a screenshot."

Screenshot is captured.

User:

> "Now create a note comparing them."

Notes opens and the agent generates the comparison.

User:

> "Which would you choose for an early-stage SaaS?"

Agent provides a spoken recommendation based on its research.

### What This Demo Shows

In one short sequence:

``` text
AssemblyAI realtime voice
        +
Turn detection
        +
Interruption
        +
Agent reasoning
        +
Tool calling
        +
Browser control
        +
Screenshots
        +
Persistent notes
        +
Voice response
```

## 25. Success Criteria

The MVP succeeds if a new viewer can understand the product within
approximately **10 seconds**.

The core interaction should work reliably:

``` text
Speak
  ↓
Agent understands
  ↓
Agent acts visibly
  ↓
User interrupts
  ↓
Agent changes behavior
  ↓
Task gets completed
```

For the hackathon demo, the most important success criteria are:

-   Voice latency feels conversational.
-   Interruptions work reliably.
-   Browser actions are visible.
-   Tool usage feels purposeful.
-   The agent maintains context.
-   The final result is useful.
-   AssemblyAI's role is obvious and meaningful.

## 26. Differentiation

The product is **not**:

> "ChatGPT with voice."

It is also **not**:

> "A computer-use agent with a microphone."

The differentiation is **continuous collaborative computer use**.

Traditional agents:

``` text
Prompt
  ↓
Agent disappears
  ↓
Agent works
  ↓
Result
```

TalkOS:

``` text
User ↔ Voice Agent ↔ Workspace
          ↑
          │
   continuous interaction
          │
          ↓
 Browser / Notes / Tools
```

The user remains part of the reasoning and execution loop.

## 27. Product Positioning

### One-line pitch

> **A computer workspace you operate together with an AI through
> conversation.**

### Hackathon pitch

> **TalkOS is a voice-first AI workspace where you can talk to an agent
> while it browses, researches, takes screenshots and creates
> notes---and interrupt or redirect it at any moment.**

### Core Product Principle

**Don't give an AI a task and wait. Work alongside it.**
