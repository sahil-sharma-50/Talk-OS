import type { ResearchCollection, RetrievedSource } from "./workspace.types";

export function exportResearchSourceMarkdown(source: RetrievedSource): string {
  return `# ${source.title}\n\nSource: ${source.url}\n\n${source.snippet}\n\n${source.content}\n`;
}

export function exportResearchCollectionMarkdown(collection: ResearchCollection, sources: RetrievedSource[]): string {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const sections = collection.sourceIds.flatMap((sourceId) => {
    const source = byId.get(sourceId);
    return source ? [`### ${source.title}\n\n${source.url}\n\n${source.snippet}\n\n${source.content}`] : [];
  });
  const summary = collection.summary ? `${collection.summary}\n\n` : "";
  return `# ${collection.query}\n\n${summary}## Sources\n\n${sections.join("\n\n")}\n`;
}
