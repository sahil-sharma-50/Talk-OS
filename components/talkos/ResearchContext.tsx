import type { SessionState } from "@/features/session/session.types";
import type { WorkspaceSnapshot } from "@/features/workspace/workspace.types";
import { ActivityTimeline } from "./ActivityTimeline";

export function ResearchContext({ state, workspace }: { state: SessionState; workspace: WorkspaceSnapshot }) {
  return (
    <aside className="research-context" aria-label="Research context">
      <section className="mission" aria-label="Current research brief">
        <h2>Current objective</h2>
        <p>{workspace.task.objective || "Tell TalkOS what outcome you need, then redirect it naturally as it works."}</p>
        <div className="constraint-list">
          <span>Constraints</span>
          {workspace.task.constraints.length ? (
            workspace.task.constraints.map((constraint) => <strong key={constraint}>{constraint}</strong>)
          ) : (
            <small>Speak naturally. Redirect at any time.</small>
          )}
        </div>
      </section>
      <section className="task-plan" aria-label="Current task plan">
        <div className="section-heading"><h2>Task plan</h2><span>r{workspace.task.revision}</span></div>
        {workspace.task.steps.length ? <ol>{workspace.task.steps.map((step) => <li key={step.id} data-status={step.status}><span />{step.label}</li>)}</ol> : <p className="empty-copy">The agent’s plan will appear here before it acts.</p>}
      </section>
      <ActivityTimeline activities={state.activities} planRevision={state.planRevision} />
    </aside>
  );
}
