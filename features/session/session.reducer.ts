import { initialSessionState } from "./session.fixtures";
import type { Activity, SessionEvent, SessionState } from "./session.types";

function updateActivity(
  activities: Activity[],
  actionId: string,
  status: Activity["status"],
  detail?: string,
): Activity[] {
  return activities.map((activity) =>
    activity.id === actionId
      ? { ...activity, status, detail: detail ?? activity.detail }
      : activity,
  );
}

export function sessionReducer(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case "CONNECTION_CHANGED":
      return {
        ...state,
        connected: event.connected,
        mode: event.mode ?? state.mode,
        error: null,
      };
    case "VOICE_STATE_CHANGED":
      return { ...state, voiceState: event.voiceState, error: null };
    case "TRANSCRIPT_PARTIAL": {
      if (!event.text) return state;
      const text = state.partialTranscript?.speaker === event.speaker
        ? `${state.partialTranscript.text}${event.text}`
        : event.text;
      return {
        ...state,
        partialTranscript: { speaker: event.speaker, text },
      };
    }
    case "TALK_TURN_FINALIZED": {
      const text = event.text.trim();
      if (!text) return state;
      return {
        ...state,
        partialTranscript: null,
        turns: [
          ...state.turns,
          {
            id: `turn-${state.turns.length + 1}-${event.at}`,
            speaker: event.speaker,
            text,
            at: event.at,
          },
        ],
      };
    }
    case "TURNS_HYDRATED":
      return { ...state, turns: event.turns };
    case "OBJECTIVE_SET":
      return { ...state, objective: event.objective };
    case "PLAN_SET":
      return {
        ...state,
        plan: event.plan,
        planRevision: state.planRevision + (event.revised ? 1 : 0),
      };
    case "ACTION_STARTED":
      return {
        ...state,
        voiceState: "acting",
        activities: [...state.activities.filter((item) => item.id !== event.action.id), event.action],
      };
    case "ACTION_COMPLETED":
      if (state.invalidatedActionIds.includes(event.actionId)) return state;
      return {
        ...state,
        activities: updateActivity(state.activities, event.actionId, "completed", event.detail),
      };
    case "ACTION_FAILED":
      return {
        ...state,
        voiceState: "error",
        activities: updateActivity(state.activities, event.actionId, "failed", event.detail),
        error: event.detail,
      };
    case "INTERRUPTION_STARTED": {
      const actionId = event.actionId ?? state.activities.findLast((item) => item.status === "active")?.id;
      return {
        ...state,
        voiceState: "interrupted",
        partialTranscript: state.partialTranscript?.speaker === "agent" ? null : state.partialTranscript,
        invalidatedActionIds: actionId && !state.invalidatedActionIds.includes(actionId)
          ? [...state.invalidatedActionIds, actionId]
          : state.invalidatedActionIds,
        activities: actionId
          ? updateActivity(state.activities, actionId, "interrupted", "Redirected by user")
          : state.activities,
      };
    }
    case "INTERRUPTED": {
      const actionId = event.actionId ?? state.activities.findLast((item) => item.status === "active")?.id;
      return {
        ...state,
        voiceState: "interrupted",
        partialTranscript: null,
        constraints: state.constraints.includes(event.constraint)
          ? state.constraints
          : [...state.constraints, event.constraint],
        invalidatedActionIds: actionId && !state.invalidatedActionIds.includes(actionId)
          ? [...state.invalidatedActionIds, actionId]
          : state.invalidatedActionIds,
        activities: actionId
          ? updateActivity(state.activities, actionId, "interrupted", "Redirected by user")
          : state.activities,
      };
    }
    case "EVIDENCE_ADDED":
      if (state.evidence.some((item) => item.id === event.evidence.id)) return state;
      return { ...state, evidence: [...state.evidence, event.evidence] };
    case "BRIEF_WRITTEN":
      return {
        ...state,
        brief: event.brief,
        activeWorkspace: "documents",
        notesHasUpdate: true,
      };
    case "WORKSPACE_CHANGED":
      return {
        ...state,
        activeWorkspace: event.workspace,
        notesHasUpdate: event.workspace === "documents" ? false : state.notesHasUpdate,
      };
    case "SESSION_STOPPED":
      return {
        ...state,
        connected: false,
        voiceState: "idle",
        partialTranscript: null,
        activities: state.activities.map((activity) =>
          activity.status === "active" ? { ...activity, status: "interrupted" } : activity,
        ),
      };
    case "SESSION_RESET":
      return { ...initialSessionState, mode: state.mode };
    case "SESSION_ERROR":
      return { ...state, voiceState: "error", error: event.message };
    default:
      return state;
  }
}
