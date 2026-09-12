import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DemoController } from "@/features/demo/demo-controller";
import { decisionBrief } from "@/features/session/session.fixtures";
import type { SessionEvent } from "@/features/session/session.types";
import { vendorEvidence } from "@/features/demo/vendor-evidence";
import { VoiceNotConfiguredError, type VoiceAdapter } from "@/features/voice/voice-adapter.types";
import type { VoiceTelemetrySnapshot } from "@/features/voice/voice-telemetry";
import { TalkOSApp } from "./TalkOSApp";

type ControllerFactory = (emit: (event: SessionEvent) => void) => DemoController;

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
    emit({
      type: "PLAN_SET",
      plan: [
        { id: "official", label: "Review official sources", status: "completed" },
        { id: "brief", label: "Prepare recommendation", status: "active" },
      ],
      at,
    });
    emit({ type: "EVIDENCE_ADDED", evidence: vendorEvidence[0], at });
    emit({ type: "BRIEF_WRITTEN", brief: decisionBrief, at });
  },
  interrupt() {},
  finish() {},
  dispose() {},
});

const voiceFromController = (factory: ControllerFactory): (() => VoiceAdapter) => () => {
  let controller: DemoController | undefined;
  return {
    async connect(emit) { controller = factory(emit); controller.start(); },
    async startListening() {},
    stopListening() {},
    async disconnect() { controller?.dispose(); },
  };
};

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("TalkOSApp", () => {
  it("allows keyboard users to switch between Documents and Research", async () => {
    const user = userEvent.setup();
    render(<TalkOSApp voiceAdapterFactory={voiceFromController(completedDemoController)} />);

    await user.click(screen.getByRole("button", { name: /start voice agent/i }));
    await user.click(screen.getByRole("tab", { name: /research/i }));
    await user.click(screen.getByRole("tab", { name: /documents/i }));

    expect(screen.getByRole("tabpanel", { name: /documents/i })).toBeVisible();
  });

  it("exposes every state-backed workspace view", async () => {
    const user = userEvent.setup();
    render(<TalkOSApp voiceAdapterFactory={voiceFromController(completedDemoController)} />);

    await user.click(screen.getByRole("button", { name: /start voice agent/i }));

    await user.click(screen.getByRole("tab", { name: /documents/i }));
    expect(screen.getByRole("tabpanel", { name: /documents/i })).toHaveTextContent("Project notes");

    await user.click(screen.getByRole("tab", { name: /research/i }));
    expect(screen.getByRole("tabpanel", { name: /research/i })).toHaveTextContent(/no web research yet/i);

    await user.click(screen.getByRole("tab", { name: /sheets/i }));
    expect(screen.getByRole("tabpanel", { name: /sheets/i })).toHaveTextContent(/create a sheet/i);

    await user.click(screen.getByRole("tab", { name: /planner/i }));
    expect(screen.getByRole("tabpanel", { name: /planner/i })).toHaveTextContent(/create a plan/i);

    await user.click(screen.getByRole("tab", { name: /settings/i }));
    expect(screen.getByRole("tabpanel", { name: /settings/i })).toHaveTextContent(/assemblyai/i);
  });

  it("shows the current live exchange and keeps older turns in History", async () => {
    const user = userEvent.setup();
    const voice = voiceFromController((emit) => ({
      start() {
        emit({ type: "TALK_TURN_FINALIZED", speaker: "user", text: "Earlier request", at });
        emit({ type: "TALK_TURN_FINALIZED", speaker: "agent", text: "Earlier answer", at });
        emit({ type: "TRANSCRIPT_PARTIAL", speaker: "user", text: "Wait", at });
        emit({ type: "TRANSCRIPT_PARTIAL", speaker: "user", text: ", target developers", at });
      },
      interrupt() {}, finish() {}, dispose() {},
    }));
    render(<TalkOSApp voiceAdapterFactory={voice} />);
    await user.click(screen.getByRole("button", { name: /start voice agent/i }));

    expect(screen.getByRole("region", { name: /live voice transcript/i })).toHaveTextContent("Wait, target developers");
    expect(screen.queryByText("Earlier request")).not.toBeInTheDocument();
    expect(screen.queryByText("Earlier answer")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /message talkos/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /history/i }));
    expect(screen.getByRole("complementary", { name: /talkos agent/i })).toContainElement(
      screen.getByRole("complementary", { name: /conversation history/i }),
    );
    expect(screen.getByText("Earlier request")).toBeVisible();
    expect(screen.getByText("Earlier answer")).toBeVisible();
  });

  it("uses the central voice agent as the only session control", () => {
    render(<TalkOSApp voiceAdapterFactory={voiceFromController(completedDemoController)} />);

    expect(screen.getByRole("button", { name: /start voice agent/i })).toBeVisible();
    expect(screen.queryByRole("button", { name: /run fallback demo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /interrupt agent/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /reset conversation/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/ask talkos to research a decision/i)).not.toBeInTheDocument();
  });

  it("switches between light, dark, and system themes", async () => {
    const user = userEvent.setup();
    render(<TalkOSApp />);

    await user.click(screen.getByRole("button", { name: /dark theme/i }));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("talkos-theme")).toBe("dark");
    await user.click(screen.getByRole("button", { name: /light theme/i }));
    expect(document.documentElement.dataset.theme).toBe("light");
    await user.click(screen.getByRole("button", { name: /system theme/i }));
    expect(localStorage.getItem("talkos-theme")).toBe("system");
  });

  it("toggles the activity drawer inside the workspace canvas", async () => {
    const user = userEvent.setup();
    render(<TalkOSApp />);
    expect(screen.queryByRole("complementary", { name: /research context/i })).not.toBeInTheDocument();
    const canvas = screen.getByRole("tabpanel", { name: /documents/i });
    const activityToggle = screen.getByRole("button", { name: /open activity sidebar/i });
    expect(activityToggle).not.toHaveTextContent("Activity");
    expect(canvas).toContainElement(activityToggle);
    await user.click(activityToggle);
    const drawer = screen.getByRole("complementary", { name: /activity drawer/i });
    expect(canvas).toContainElement(drawer);
    expect(drawer).not.toHaveTextContent("—");
    await user.click(screen.getByRole("button", { name: /hide activity sidebar/i }));
    expect(screen.queryByRole("complementary", { name: /activity drawer/i })).not.toBeInTheDocument();
  });

  it("reveals real AssemblyAI telemetry only when Developer Mode is enabled", async () => {
    const user = userEvent.setup();
    const telemetry: VoiceTelemetrySnapshot = {
      connected: true,
      endpointLatencyMs: 124,
      responseLatencyMs: 218,
      lastEndpointAt: 1000,
      lastUserFinalAt: 1124,
      events: [{
        id: "endpoint-1000",
        kind: "endpoint_detected",
        label: "Endpoint detected",
        receivedAt: 1000,
      }],
    };
    let onTelemetry: ((snapshot: VoiceTelemetrySnapshot) => void) | undefined;
    const factory = (): VoiceAdapter => ({
      async connect() { onTelemetry?.(telemetry); },
      async startListening() {},
      stopListening() {},
      setTelemetryListener(listener) { onTelemetry = listener; },
      async disconnect() {},
    });
    render(<TalkOSApp voiceAdapterFactory={factory} />);
    await user.click(screen.getByRole("button", { name: /start voice agent/i }));
    await user.click(screen.getByRole("button", { name: /open activity sidebar/i }));

    expect(screen.queryByText(/endpoint latency/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: /developer mode/i }));
    expect(screen.getByText(/assemblyai live/i)).toBeVisible();
    expect(screen.getByText(/endpoint latency/i)).toBeVisible();
    expect(screen.getByText("124 ms")).toBeVisible();
    expect(screen.getByText(/endpoint detected/i)).toBeVisible();
  });

  it("rejects an email-shaped AssemblyAI Agent ID", async () => {
    const user = userEvent.setup();
    const factory = vi.fn((): VoiceAdapter => ({ async connect() {}, async startListening() {}, stopListening() {}, async disconnect() {} }));
    render(<TalkOSApp voiceAdapterFactory={factory} />);
    await user.click(screen.getByRole("tab", { name: /settings/i }));
    await user.type(screen.getByLabelText(/assemblyai api key/i), "secret");
    await user.type(screen.getByLabelText(/agent id/i), "person@example.com");
    await user.click(screen.getByRole("button", { name: /start voice agent/i }));
    expect(factory).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/agent id.*email/i);
  });

  it("accepts session-only AssemblyAI credentials and passes them to live voice", async () => {
    const user = userEvent.setup();
    const connect = vi.fn();
    const factory = vi.fn((): VoiceAdapter => ({
      connect,
      async startListening() {},
      stopListening() {},
      async disconnect() {},
    }));
    render(<TalkOSApp voiceAdapterFactory={factory} />);

    await user.click(screen.getByRole("tab", { name: /settings/i }));
    const apiKey = screen.getByLabelText(/assemblyai api key/i);
    expect(apiKey).toHaveAttribute("type", "password");
    await user.type(apiKey, "user-secret");
    await user.type(screen.getByLabelText(/agent id/i), "agent-user");
    await user.click(screen.getByRole("button", { name: /start voice agent/i }));

    expect(factory).toHaveBeenCalledWith(
      { apiKey: "user-secret", agentId: "agent-user", tavilyApiKey: "" },
      expect.objectContaining({ getWorkspace: expect.any(Function), setWorkspace: expect.any(Function), getTavilyApiKey: expect.any(Function) }),
    );
  });

  it("does not start when only one credential field is filled", async () => {
    const user = userEvent.setup();
    const factory = vi.fn((): VoiceAdapter => ({
      async connect() {}, async startListening() {}, stopListening() {}, async disconnect() {},
    }));
    render(<TalkOSApp voiceAdapterFactory={factory} />);

    await user.click(screen.getByRole("tab", { name: /settings/i }));
    await user.type(screen.getByLabelText(/assemblyai api key/i), "partial-secret");
    await user.click(screen.getByRole("button", { name: /start voice agent/i }));

    expect(factory).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/both the api key and agent id/i);
  });

  it("stops an active session", async () => {
    const user = userEvent.setup();
    render(<TalkOSApp voiceAdapterFactory={voiceFromController(instantDemoController)} />);

    await user.click(screen.getByRole("button", { name: /start voice agent/i }));
    await user.click(screen.getByRole("button", { name: /stop session/i }));

    expect(screen.getByRole("button", { name: /stop session/i })).toBeDisabled();
  });

  it("explains when live voice is not configured", async () => {
    const user = userEvent.setup();
    const unavailableAdapter: VoiceAdapter = {
      async connect() { throw new VoiceNotConfiguredError(); },
      async startListening() {},
      stopListening() {},
      async disconnect() {},
    };
    render(
      <TalkOSApp
        voiceAdapterFactory={() => unavailableAdapter}
      />,
    );

    await user.click(screen.getByRole("button", { name: /start voice agent/i }));

    expect(screen.getByText(/live voice is not configured/i)).toBeVisible();
    expect(screen.getByRole("button", { name: /start voice agent/i })).toBeEnabled();
  });
});
