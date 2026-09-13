import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TalkOSApp } from "./TalkOSApp";
import type { VoiceAdapter, VoiceEventSink } from "@/features/voice/voice-adapter.types";
import { useState } from "react";
import { DocumentWorkspace } from "./DocumentWorkspace";
import { createWorkspace, editWorkspaceDocument } from "@/features/workspace/workspace-model";
import { createPlanner, createSheet } from "@/features/workspace/workspace-model";
import { PlannerWorkspace } from "./PlannerWorkspace";
import { SheetsWorkspace } from "./SheetsWorkspace";

describe("session recovery", () => {
  it("starts from voice and records the spoken user turn without a message composer", async () => {
    const startListening = vi.fn();
    render(<TalkOSApp voiceAdapterFactory={() => ({ async connect(emit) {
      emit({ type: "CONNECTION_CHANGED", connected: true, at: new Date().toISOString() });
      emit({ type: "TALK_TURN_FINALIZED", speaker: "user", text: "Create a budget", at: new Date().toISOString() });
    }, startListening, stopListening() {}, async disconnect() {} })} />);
    fireEvent.click(screen.getByRole("button", { name: "Start voice agent" }));
    await waitFor(() => expect(startListening).toHaveBeenCalledOnce());
    expect(screen.queryByRole("textbox", { name: "Message TalkOS" })).not.toBeInTheDocument();
    expect(screen.getAllByText("Create a budget").length).toBeGreaterThan(0);
  });

  it("reconnects with a new adapter after a dropped connection", async () => {
    let emit: VoiceEventSink = () => {};
    const factory = vi.fn((): VoiceAdapter => ({ async connect(sink) { emit = sink; sink({ type: "CONNECTION_CHANGED", connected: true, at: new Date().toISOString() }); }, async startListening() {}, stopListening() {}, async disconnect() {} }));
    render(<TalkOSApp voiceAdapterFactory={factory} />);
    fireEvent.click(screen.getByRole("button", { name: "Start voice agent" }));
    await waitFor(() => expect(factory).toHaveBeenCalledTimes(1));
    act(() => emit({ type: "CONNECTION_CHANGED", connected: false, at: new Date().toISOString() }));
    fireEvent.click(screen.getByRole("button", { name: "Start voice agent" }));
    await waitFor(() => expect(factory).toHaveBeenCalledTimes(2));
  });

  it("can mute and resume the microphone during a voice session", async () => {
    const startListening = vi.fn(); const stopListening = vi.fn();
    render(<TalkOSApp voiceAdapterFactory={() => ({ async connect(emit) { emit({ type: "CONNECTION_CHANGED", connected: true, at: new Date().toISOString() }); }, startListening, stopListening, submitText() {}, async disconnect() {} })} />);
    fireEvent.click(screen.getByRole("button", { name: "Start voice agent" }));
    await waitFor(() => expect(startListening).toHaveBeenCalledOnce());
    fireEvent.click(await screen.findByRole("button", { name: "Mute microphone" }));
    expect(stopListening).toHaveBeenCalledOnce();
    fireEvent.click(await screen.findByRole("button", { name: "Enable microphone" }));
    await waitFor(() => expect(startListening).toHaveBeenCalledTimes(2));
  });
});

describe("document draft safety", () => {
  it("retains an unsaved draft when switching workspace tabs", async () => {
    render(<TalkOSApp />);
    const editor = await screen.findByRole("textbox", { name: "Document content" });
    fireEvent.change(editor, { target: { value: "Keep my unsaved work" } });
    fireEvent.click(screen.getByRole("tab", { name: "Sheets" }));
    fireEvent.click(screen.getByRole("tab", { name: "Documents" }));
    expect(screen.getByRole("textbox", { name: "Document content" })).toHaveValue("Keep my unsaved work");
  });

  it("requires an explicit choice before replacing an agent update with a draft", () => {
    function Harness() {
      const [workspace, setWorkspace] = useState(createWorkspace);
      return <><button onClick={() => { const result = editWorkspaceDocument(workspace, workspace.activeDocumentId, "Agent version", 1, "agent"); if (result.ok) setWorkspace(result.workspace); }}>Agent edit</button><DocumentWorkspace workspace={workspace} onChange={setWorkspace} /></>;
    }
    render(<Harness />);
    fireEvent.change(screen.getByRole("textbox", { name: "Document content" }), { target: { value: "My version" } });
    fireEvent.click(screen.getByRole("button", { name: "Agent edit" }));
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Use saved version" }));
    expect(screen.getByRole("textbox", { name: "Document content" })).toHaveValue("Agent version");
  });
});

it("lets users inspect and edit task dates instead of exporting an invisible schedule", () => {
  function Harness() {
    const [workspace, setWorkspace] = useState(() => createPlanner(createWorkspace(), "Plan", [{ id: "task", title: "Launch", completed: false }]));
    return <PlannerWorkspace workspace={workspace} onChange={setWorkspace} />;
  }
  render(<Harness />);
  fireEvent.click(screen.getByRole("button", { name: "Edit Launch" }));
  fireEvent.change(screen.getByLabelText("Due date for Launch"), { target: { value: "2026-09-20" } });
  expect(screen.getByLabelText("Due date for Launch")).toHaveValue("2026-09-20");
});

it("shows imported sheet data beyond the initial viewport", () => {
  render(<SheetsWorkspace workspace={createSheet(createWorkspace(), "Large import", { Z1000: { value: "Last cell" } })} onChange={vi.fn()} />);
  fireEvent.change(screen.getByLabelText("Sheet rows"), { target: { value: "62" } });
  expect(screen.getByRole("textbox", { name: "Z1000" })).toHaveValue("Last cell");
});
