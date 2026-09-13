import { Fragment } from "react";
import { Check, Circle, OctagonX } from "lucide-react";
import type { SessionState } from "@/features/session/session.types";

export function ActivityTimeline({ activities, planRevision, receiptCount = 0, hasSavedHistory = false, onClear }: Pick<SessionState, "activities" | "planRevision"> & { receiptCount?: number; hasSavedHistory?: boolean; onClear?: () => void }) {
  const recordCount = activities.length + receiptCount;
  const interruptedIndex = activities.findIndex((item) => item.status === "interrupted");
  const revisionMarker = planRevision > 0 ? (
    <li className="activity__revision">
      <span>↪</span>
      <strong>Plan revised</strong>
    </li>
  ) : null;

  return (
    <section className="activity" aria-label="Agent activity" aria-live="polite">
      <div className="section-heading">
        <h2>Action ledger</h2>
        <span>{recordCount}</span>
        {onClear ? <button type="button" className="quiet-action" onClick={onClear} disabled={!hasSavedHistory && !activities.some((item) => item.status !== "active")}>Clear ledger</button> : null}
      </div>
      <ol className="activity__list">
        {recordCount === 0 ? <li className="empty-copy">No activity yet.</li> : null}
        {activities.map((item, index) => (
          <Fragment key={item.id}>
            <li className="activity__item" data-status={item.status}>
              <span className="activity__time">{String(index + 1).padStart(2, "0")}</span>
              <span className="activity__mark" aria-hidden="true">
                {item.status === "completed" ? <Check size={13} /> : item.status === "interrupted" ? <OctagonX size={13} /> : <Circle size={9} fill="currentColor" />}
              </span>
              <span>
                <strong>{item.label}</strong>
                {item.detail ? <small>{item.detail}</small> : null}
              </span>
            </li>
            {index === interruptedIndex ? revisionMarker : null}
          </Fragment>
        ))}
        {interruptedIndex === -1 ? revisionMarker : null}
      </ol>
    </section>
  );
}
