import { BookOpenText, Globe2 } from "lucide-react";
import type { SessionState, WorkspaceView } from "@/features/session/session.types";
import { DecisionNotes } from "./DecisionNotes";
import { EvidenceBrowser } from "./EvidenceBrowser";

interface WorkspaceProps {
  state: SessionState;
  onWorkspaceChange: (workspace: WorkspaceView) => void;
}

export function Workspace({ state, onWorkspaceChange }: WorkspaceProps) {
  return (
    <section className="workspace" aria-label="Agent workspace">
      <div className="workspace-tabs" role="tablist" aria-label="Workspace views">
        <button
          type="button"
          role="tab"
          id="browser-tab"
          aria-selected={state.activeWorkspace === "browser"}
          aria-controls="browser-panel"
          onClick={() => onWorkspaceChange("browser")}
        >
          <Globe2 size={16} /> Browser
        </button>
        <button
          type="button"
          role="tab"
          id="notes-tab"
          aria-selected={state.activeWorkspace === "notes"}
          aria-controls="notes-panel"
          onClick={() => onWorkspaceChange("notes")}
        >
          <BookOpenText size={16} /> Notes
          {state.notesHasUpdate ? <span className="update-dot" aria-label="Updated" /> : null}
        </button>
        <span className="workspace-tabs__meta">
          {state.evidence.length ? `${state.evidence.length} sources captured` : "Read-only research session"}
        </span>
      </div>

      {state.activeWorkspace === "browser" ? (
        <div role="tabpanel" id="browser-panel" aria-labelledby="browser-tab" aria-label="Browser">
          <EvidenceBrowser evidence={state.evidence} />
        </div>
      ) : (
        <div role="tabpanel" id="notes-panel" aria-labelledby="notes-tab" aria-label="Notes">
          <DecisionNotes brief={state.brief} evidence={state.evidence} />
        </div>
      )}
    </section>
  );
}
