# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The hackathon prototype serves startup operators, technical founders, and procurement-minded knowledge workers who need to compare software vendors while actively directing the research.

## Product Purpose

TalkOS lets a user speak to an AI agent while watching it gather evidence, interrupt the work at any moment, and see the active plan change before the agent continues. A successful session produces a concise, traceable decision brief instead of an opaque answer.

## Positioning

TalkOS keeps the user inside an active computer-use loop: talk, watch, interrupt, redirect, and continue without restarting the task. Its defining mechanism is immediate, visible replanning after a spoken interruption.

## Operating Context

The flagship demonstration compares Supabase and Firebase for an early-stage company. The user narrows the work to official sources, compliance, and a sub-$100 monthly starting cost while the agent is already researching. The judged workflow lasts 60–90 seconds and ends in a cited recommendation.

## Capabilities and Constraints

- Real AssemblyAI voice sessions provide realtime transcription, turn handling, interruption, and tool calls when configured.
- Deterministic demo mode exercises the same normalized session events without credentials.
- The workspace contains controlled Browser and Notes views.
- Actions are read-only; general desktop control, arbitrary visual clicking, authenticated browsing, terminal access, and cloud accounts are excluded.
- The AssemblyAI API key remains server-only and the browser receives a short-lived credential.
- User-visible plans and actions never expose chain-of-thought.

## Brand Commitments

The product name is TalkOS. The approved voice is concise, composed, evidence-led, and operational. The interface should feel like an analyst's working instrument, not a generic chatbot or fictional operating system.

## Evidence on Hand

- Product requirements: `talkos-prd.md` in the parent project workspace.
- Hackathon criteria: `hackathon.md` in the parent project workspace.
- Approved build design: `docs/superpowers/specs/2026-09-12-talkos-demo-design.md`.
- The vendor comparison uses clearly labeled demonstration data and links to official Supabase and Firebase pages. No customer claims, testimonials, or performance benchmarks exist and none may be fabricated.

## Product Principles

- Make interruption the memorable proof, not a hidden technical feature.
- Show what changed and why in one glance.
- Prefer a reliable, narrow workflow over broad but fragile automation.
- Keep every recommendation traceable to visible evidence.
- Preserve user control whenever the agent acts or speaks.

## Accessibility & Inclusion

Core controls must be keyboard accessible, status changes must be announced without overwhelming assistive technology, focus must remain visible, and nonessential motion must respect reduced-motion preferences. Demo mode remains usable if microphone permission is unavailable.

