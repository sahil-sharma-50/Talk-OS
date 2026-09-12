import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DemoController } from "@/features/demo/demo-controller";
import { decisionBrief } from "@/features/session/session.fixtures";
import { VoiceNotConfiguredError, type VoiceAdapter } from "@/features/voice/voice-adapter.types";
import { TalkOSApp, type ControllerFactory } from "./TalkOSApp";

const at = "2026-09-12T12:00:00.000Z";

const instantDemoController: ControllerFactory = (emit) => ({
  start() {
    emit({ type: "CONNECTION_CHANGED", connected: true, mode: "demo", at });
    emit({
      type: "ACTION_STARTED",
      action: {
        id: "search-initial",
        label: "Scanning the open web",
        detail: "Broad comparison",
        status: "active",
        at,
      },
      at,
    });
  },
  interrupt(constraint = "Use official sources only") {
    emit({ type: "INTERRUPTED", actionId: "search-initial", constraint, at });
    emit({
      type: "PLAN_SET",
      revised: true,
      plan: [{ id: "official", label: "Check official sources", status: "active" }],
      at,
    });
    emit({
      type: "ACTION_STARTED",
      action: {
        id: "research-official",
        label: "Checking official sources",
        detail: "Pricing and compliance only",
        status: "active",
        at,
      },
      at,
    });
  },
  finish() {
    emit({ type: "BRIEF_WRITTEN", brief: decisionBrief, at });
  },
  dispose() {},
}) satisfies DemoController;

const completedDemoController: ControllerFactory = (emit) => ({
  start() {
    emit({ type: "BRIEF_WRITTEN", brief: decisionBrief, at });
  },
  interrupt() {},
  finish() {},
  dispose() {},
});

describe("TalkOSApp", () => {
  it("shows the revised constraint after the user interrupts", async () => {
    const user = userEvent.setup();
    render(<TalkOSApp controllerFactory={instantDemoController} />);

    await user.click(screen.getByRole("button", { name: /run the demo/i }));
    await user.click(screen.getByRole("button", { name: /interrupt agent/i }));

    expect(screen.getByText(/use official sources only/i)).toBeVisible();
    expect(screen.getByText(/plan revised/i)).toBeVisible();
    const cancelled = screen.getByText("Scanning the open web");
    const revision = screen.getByText("Plan revised");
    const replacement = screen.getByText("Checking official sources");
    expect(cancelled.compareDocumentPosition(revision) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(revision.compareDocumentPosition(replacement) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("allows keyboard users to switch between Browser and Notes", async () => {
    const user = userEvent.setup();
    render(<TalkOSApp controllerFactory={completedDemoController} />);

    await user.click(screen.getByRole("button", { name: /run the demo/i }));
    await user.click(screen.getByRole("tab", { name: /browser/i }));
    await user.click(screen.getByRole("tab", { name: /notes/i }));

    expect(screen.getByRole("tabpanel", { name: /notes/i })).toBeVisible();
  });

  it("stops an active session", async () => {
    const user = userEvent.setup();
    render(<TalkOSApp controllerFactory={instantDemoController} />);

    await user.click(screen.getByRole("button", { name: /run the demo/i }));
    await user.click(screen.getByRole("button", { name: /stop session/i }));

    expect(screen.getByText("Ready")).toBeVisible();
  });

  it("keeps demo mode available when live voice is not configured", async () => {
    const user = userEvent.setup();
    const unavailableAdapter: VoiceAdapter = {
      async connect() { throw new VoiceNotConfiguredError(); },
      async startListening() {},
      stopListening() {},
      interrupt() {},
      async disconnect() {},
    };
    render(
      <TalkOSApp
        controllerFactory={instantDemoController}
        voiceAdapterFactory={() => unavailableAdapter}
      />,
    );

    await user.click(screen.getByRole("button", { name: /start live voice/i }));

    expect(screen.getByText(/live voice is not configured/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /run the demo/i })).toBeEnabled();
  });

  it("forwards an interruption to a connected live voice session", async () => {
    const user = userEvent.setup();
    const interrupt = vi.fn();
    const liveAdapter: VoiceAdapter = {
      async connect(emit) {
        emit({ type: "CONNECTION_CHANGED", connected: true, mode: "live", at });
        emit({ type: "VOICE_STATE_CHANGED", voiceState: "listening", at });
      },
      async startListening() {},
      stopListening() {},
      interrupt,
      async disconnect() {},
    };
    render(<TalkOSApp voiceAdapterFactory={() => liveAdapter} />);

    await user.click(screen.getByRole("button", { name: /start live voice/i }));
    await user.click(screen.getByRole("button", { name: /interrupt agent/i }));

    expect(interrupt).toHaveBeenCalledOnce();
  });
});
