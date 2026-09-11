import { ExternalLink, FileText } from "lucide-react";
import type { SessionState } from "@/features/session/session.types";

export function DecisionNotes({ brief, evidence }: Pick<SessionState, "brief" | "evidence">) {
  if (!brief) {
    return (
      <div className="notes-empty">
        <FileText size={34} strokeWidth={1.3} aria-hidden="true" />
        <h2>Decision brief not written yet</h2>
        <p>TalkOS will turn captured evidence into a recommendation after the research is complete.</p>
      </div>
    );
  }

  return (
    <article className="decision-note">
      <header>
        <div>
          <span>Decision memo · Demo data</span>
          <h2>{brief.title}</h2>
        </div>
        <p>{brief.evidenceIds.length} cited sources</p>
      </header>

      <section className="decision-note__brief">
        <h3>Revised brief</h3>
        <ul>{brief.requirements.map((requirement) => <li key={requirement}>{requirement}</li>)}</ul>
      </section>

      <div className="comparison-table" role="table" aria-label="Vendor comparison">
        <div className="comparison-row comparison-row--header" role="row">
          <span role="columnheader">Signal</span>
          <span role="columnheader">Supabase</span>
          <span role="columnheader">Firebase</span>
        </div>
        {brief.comparison.map((row) => (
          <div className="comparison-row" role="row" key={row.category}>
            <strong role="cell">{row.category}</strong>
            <span role="cell">{row.supabase}</span>
            <span role="cell">{row.firebase}</span>
          </div>
        ))}
      </div>

      <section className="recommendation">
        <span>Recommendation</span>
        <h3>{brief.recommendation}</h3>
        <p>{brief.rationale}</p>
      </section>

      <footer className="citations">
        {evidence.map((item, index) => (
          <a href={item.sourceUrl} target="_blank" rel="noreferrer" key={item.id}>
            [{index + 1}] {item.sourceLabel} <ExternalLink size={12} aria-hidden="true" />
          </a>
        ))}
      </footer>
    </article>
  );
}
