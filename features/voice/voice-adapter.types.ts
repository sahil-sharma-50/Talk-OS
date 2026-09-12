import type { SessionEvent } from "@/features/session/session.types";
import type { VoiceTelemetrySnapshot } from "./voice-telemetry";

export type VoiceEventSink = (event: SessionEvent) => void;

export interface VoiceCredentials {
  apiKey: string;
  agentId: string;
  tavilyApiKey?: string;
}

export interface VoiceAdapter {
  connect(emit: VoiceEventSink): Promise<void>;
  startListening(): Promise<void>;
  stopListening(): void;
  submitText?(text: string): void;
  setMuted?(muted: boolean): void;
  setLevelListener?(listener: (level: number) => void): void;
  setTelemetryListener?(listener: (snapshot: VoiceTelemetrySnapshot) => void): void;
  disconnect(): Promise<void>;
}

export class VoiceNotConfiguredError extends Error {
  constructor() {
    super("Live voice is not configured. Add your AssemblyAI credentials in Settings.");
    this.name = "VoiceNotConfiguredError";
  }
}
