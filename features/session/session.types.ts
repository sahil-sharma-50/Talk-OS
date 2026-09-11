export type VoiceState =
  | "idle"
  | "connecting"
  | "listening"
  | "thinking"
  | "acting"
  | "speaking"
  | "interrupted"
  | "error";

export type Speaker = "user" | "agent";
export type WorkspaceView = "browser" | "notes";
export type ActivityStatus = "pending" | "active" | "completed" | "interrupted" | "failed";

export interface ConversationTurn {
  id: string;
  speaker: Speaker;
  text: string;
  at: string;
}

export interface Activity {
  id: string;
  label: string;
  detail: string;
  status: ActivityStatus;
  at: string;
}

export interface PlanItem {
  id: string;
  label: string;
  status: "pending" | "active" | "completed";
}

export interface Evidence {
  id: string;
  provider: "Supabase" | "Firebase";
  category: "Pricing" | "Authentication" | "Compliance";
  title: string;
  finding: string;
  sourceLabel: string;
  sourceUrl: string;
  demoData: true;
}

export interface DecisionBrief {
  title: string;
  updatedAt: string;
  requirements: string[];
  comparison: Array<{
    category: Evidence["category"];
    supabase: string;
    firebase: string;
  }>;
  recommendation: string;
  rationale: string;
  evidenceIds: string[];
}

export interface SessionState {
  mode: "demo" | "live";
  connected: boolean;
  voiceState: VoiceState;
  partialTranscript: { speaker: Speaker; text: string } | null;
  turns: ConversationTurn[];
  objective: string | null;
  constraints: string[];
  plan: PlanItem[];
  planRevision: number;
  activities: Activity[];
  invalidatedActionIds: string[];
  evidence: Evidence[];
  brief: DecisionBrief | null;
  activeWorkspace: WorkspaceView;
  notesHasUpdate: boolean;
  error: string | null;
}

type Timed = { at: string };

export type SessionEvent =
  | (Timed & { type: "CONNECTION_CHANGED"; connected: boolean; mode?: "demo" | "live" })
  | (Timed & { type: "VOICE_STATE_CHANGED"; voiceState: VoiceState })
  | (Timed & { type: "TRANSCRIPT_PARTIAL"; speaker: Speaker; text: string })
  | (Timed & { type: "TALK_TURN_FINALIZED"; speaker: Speaker; text: string })
  | (Timed & { type: "OBJECTIVE_SET"; objective: string })
  | (Timed & { type: "PLAN_SET"; plan: PlanItem[]; revised?: boolean })
  | (Timed & { type: "ACTION_STARTED"; action: Activity })
  | (Timed & { type: "ACTION_COMPLETED"; actionId: string; detail?: string })
  | (Timed & { type: "ACTION_FAILED"; actionId: string; detail: string })
  | (Timed & { type: "INTERRUPTED"; actionId?: string; constraint: string })
  | (Timed & { type: "EVIDENCE_ADDED"; evidence: Evidence })
  | (Timed & { type: "BRIEF_WRITTEN"; brief: DecisionBrief })
  | (Timed & { type: "WORKSPACE_CHANGED"; workspace: WorkspaceView })
  | (Timed & { type: "SESSION_STOPPED" })
  | (Timed & { type: "SESSION_RESET" })
  | (Timed & { type: "SESSION_ERROR"; message: string });
