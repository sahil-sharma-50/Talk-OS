import { ArrowLeft, ArrowRight, Check, ExternalLink, LockKeyhole, Search } from "lucide-react";
import type { Evidence } from "@/features/session/session.types";

export function EvidenceBrowser({ evidence }: { evidence: Evidence[] }) {
  const active = evidence.at(-1);

  return (
    <div className="research-browser">
      <div className="browser-bar" aria-label="Research browser controls">
        <ArrowLeft size={16} aria-hidden="true" />
        <ArrowRight size={16} aria-hidden="true" />
        <div className="address-bar">
          <LockKeyhole size={13} aria-hidden="true" />
          <span>{active?.sourceUrl ?? "research://official-sources"}</span>
        </div>
      </div>

      <div className="browser-content">
        <article className="source-document">
          {active ? (
            <>
              <div className="source-document__masthead">
                <span>{active.provider}</span>
                <span>Official documentation</span>
              </div>
              <p className="source-document__category">{active.category}</p>
              <h2>{active.title}</h2>
              <p className="source-document__finding">{active.finding}</p>
              <div className="source-document__quote">
                <strong>Captured finding</strong>
                <p>{active.finding}</p>
              </div>
              <a href={active.sourceUrl} target="_blank" rel="noreferrer">
                Open {active.sourceLabel}
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            </>
          ) : (
            <div className="browser-empty">
              <Search size={30} strokeWidth={1.3} aria-hidden="true" />
              <p>Research surface ready</p>
              <span>Start a live session to watch evidence arrive.</span>
            </div>
          )}
        </article>

        <aside className="source-stack" aria-label="Captured sources">
          <div className="source-stack__heading">
            <h2>Source stack</h2>
            <span>{evidence.length}/4</span>
          </div>
          {evidence.length === 0 ? <p className="empty-copy">No sources captured yet.</p> : null}
          {evidence.map((item, index) => (
            <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="source-row" key={item.id}>
              <span className="source-row__number">{String(index + 1).padStart(2, "0")}</span>
              <span>
                <strong>{item.provider} · {item.category}</strong>
                <small>{item.sourceLabel}</small>
              </span>
              <Check className="source-row__check" size={15} aria-label="Captured" />
            </a>
          ))}
        </aside>
      </div>
    </div>
  );
}
