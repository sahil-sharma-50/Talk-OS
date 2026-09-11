import type { SessionEvent } from "@/features/session/session.types";

export type VoiceEventSink = (event: SessionEvent) => void;

export interface VoiceAdapter {
  connect(emit: VoiceEventSink): Promise<void>;
  startListening(): Promise<void>;
  stopListening(): void;
  interrupt(): void;
  disconnect(): Promise<void>;
}

export class VoiceNotConfiguredError extends Error {
  constructor() {
    super("Live voice is not configured. Add the AssemblyAI environment variables or use demo mode.");
    this.name = "VoiceNotConfiguredError";
  }
}
