import { ExternalLink, Globe2, Search } from "lucide-react";
import { exportResearchCollectionMarkdown, exportResearchSourceMarkdown } from "@/features/workspace/research-export";
import { deleteResearchCollection, deleteResearchSource } from "@/features/workspace/workspace-model";
import type { WorkspaceSnapshot } from "@/features/workspace/workspace.types";
import { ResearchActionMenu } from "./ResearchActionMenu";
import { WorkspaceResizeHandle } from "./WorkspaceResizeHandle";

function filename(value: string) {
  return value.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "research";
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/markdown" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ResearchWorkspace({ workspace, onChange }: { workspace: WorkspaceSnapshot; onChange: (workspace: WorkspaceSnapshot) => void }) {
  const collection = workspace.researchCollections.find((item) => item.id === workspace.selectedResearchCollectionId) ?? workspace.researchCollections.at(-1);
  const collectionSources = collection ? collection.sourceIds.map((id) => workspace.sources.find((source) => source.id === id)).filter(Boolean) : [];
  const selected = collectionSources.find((source) => source?.id === workspace.selectedSourceId) ?? collectionSources[0];
  const hostname = (url: string) => { try { return new URL(url).hostname; } catch { return url; } };
  return <div className="research-workspace research-grouped">
    <aside className="research-queries">
      <header><strong>Searches</strong><span>{workspace.researchCollections.length}</span></header>
      {workspace.researchCollections.map((item) => <div className="research-query-row" data-active={item.id === collection?.id} key={item.id}>
        <button type="button" aria-current={item.id === collection?.id ? "page" : undefined} onClick={() => onChange({ ...workspace, selectedResearchCollectionId: item.id, selectedSourceId: item.sourceIds[0] ?? null })}><Search size={14} /><span><strong>{item.query}</strong><small>{item.sourceIds.length} sources · {item.status}</small></span></button>
        <ResearchActionMenu
          label={item.query}
          kind="saved search"
          onDownload={() => download(`${filename(item.query)}.md`, exportResearchCollectionMarkdown(item, workspace.sources))}
          onDelete={() => onChange(deleteResearchCollection(workspace, item.id))}
        />
      </div>)}
      {!collection ? <div className="research-empty"><Globe2 size={28} /><strong>No web research yet</strong><p>Ask TalkOS to investigate something that helps finish your task.</p></div> : null}
    </aside>
    <section className="research-results">
      {collection ? <><header><div><h2>{collection.query}</h2><p>{collection.summary || "Sources collected for this search. Open one to inspect the evidence."}</p></div><span>{collectionSources.length} results</span></header><div className="research-result-list">{collectionSources.map((source) => source ? <div className="research-result-row" data-active={source.id === selected?.id} key={source.id}>
        <button type="button" aria-current={source.id === selected?.id ? "page" : undefined} onClick={() => onChange({ ...workspace, selectedSourceId: source.id })}><strong>{source.title}</strong><small>{hostname(source.url)}</small><p>{source.snippet}</p></button>
        <ResearchActionMenu
          label={source.title}
          kind="result"
          onDownload={() => download(`${filename(source.title)}.md`, exportResearchSourceMarkdown(source))}
          onDelete={() => onChange(deleteResearchSource(workspace, collection.id, source.id))}
        />
      </div> : null)}</div></> : <div className="reader-empty"><Globe2 size={34} /><h2>Research joins the work when you need it</h2><p>Every search stays grouped with its sources and summary.</p></div>}
    </section>
    {selected ? <article className="research-reader"><header><div><small>Source</small><h2>{selected.title}</h2></div><a href={selected.url} target="_blank" rel="noreferrer">Open <ExternalLink size={14} /></a></header><p className="source-snippet">{selected.snippet}</p><div className="source-content">{selected.content || "Ask TalkOS to read this source for the full extracted text."}</div></article> : null}
    <WorkspaceResizeHandle />
  </div>;
}
