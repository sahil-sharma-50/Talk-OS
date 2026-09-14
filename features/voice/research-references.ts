import type { RetrievedSource } from "@/features/workspace/workspace.types";
import type { WorkspaceRuntime } from "./research-tools";

// Only sources actually returned to this request belong in its reference list.
// Do not use the workspace's full history as evidence for a new report.
const requests = new WeakMap<WorkspaceRuntime, { request: string; requestId?: string; sources: Map<string, RetrievedSource> }>();

const reusesSelectedResearch = (request: string) => [
  /\b(?:saved|selected|previous|that|this)\s+(?:research|sources?|references?|evidence)\b/i,
  /\bthose\s+(?:sources?|references?|results?|findings)\b/i,
  /\b(?:put|turn|compile|add|use)\s+(?:the\s+)?research\s+into\b/i,
].some(pattern => pattern.test(request));

export function rememberResearchReferences(runtime: WorkspaceRuntime, request: string | undefined, requestId: string | undefined, toolName: string, result: Record<string, unknown>) {
  if (!request || runtime.getCurrentRequest?.() !== request) return;
  const currentRequestId = runtime.getCurrentRequestId?.();
  if (requestId === undefined ? currentRequestId !== undefined : currentRequestId !== requestId) return;
  const selected = result.selected_research as { sources?: unknown } | undefined;
  const sources = ["search_web", "read_sources"].includes(toolName) ? result.sources
    : toolName === "get_workspace" && reusesSelectedResearch(request) ? selected?.sources
    : undefined;
  if (!Array.isArray(sources)) return;
  let entry = requests.get(runtime);
  const sameRequest = requestId === undefined ? entry?.requestId === undefined && entry?.request === request : entry?.requestId === requestId;
  if (!sameRequest || !entry) {
    entry = { request, requestId, sources: new Map() };
    requests.set(runtime, entry);
  }
  const workspaceSources = runtime.getWorkspace().sources;
  for (const item of sources) {
    if (!item || typeof item.url !== "string") continue;
    const source = workspaceSources.find(source => source.url === item.url);
    if (source && /^https?:\/\//i.test(source.url)) entry.sources.set(source.url, source);
  }
}

export function withResearchReferences(content: string, runtime: WorkspaceRuntime): string {
  const request = runtime.getCurrentRequest?.();
  if (!request) return content;
  const entry = requests.get(runtime);
  const requestId = runtime.getCurrentRequestId?.();
  const sameRequest = requestId === undefined ? entry?.requestId === undefined && entry?.request === request : entry?.requestId === requestId;
  if (!sameRequest || !entry) return content;
  const recent = [...entry.sources.values()].sort((left, right) => {
    const leftTime = Date.parse(left.retrievedAt); const rightTime = Date.parse(right.retrievedAt);
    return (Number.isFinite(leftTime) ? leftTime : 0) - (Number.isFinite(rightTime) ? rightTime : 0);
  }).slice(-8);
  const missing = recent.filter(source => !content.includes(source.url));
  if (!missing.length) return content;
  const links = missing.map(source => {
    const title = source.title.replace(/\s+/g, " ").replace(/[\\[\]]/g, "\\$&");
    const url = source.url.replace(/[\s()<>]/g, character => character === "(" ? "%28" : character === ")" ? "%29" : encodeURIComponent(character));
    return `- [${title}](${url})`;
  });
  return `${content.trimEnd()}\n\n## Research references\n\nSources retrieved for this request. This reference list does not independently verify every claim above.\n\n${links.join("\n")}`;
}
