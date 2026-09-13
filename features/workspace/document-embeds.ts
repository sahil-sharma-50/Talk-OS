import type { DocumentEmbeds } from "./workspace.types";
import { drawingOnlySnapshot } from "./document-snapshot";
import { sheetSnapshotMarkdown } from "./sheet-snapshot";
import { normalizeDocumentMarkdown } from "./document-markdown";

export const documentEmbedPattern = /^!\[([^\]\n]*)\]\(talkos-embed:([\w-]+)\)\s*$/;
export const canvasSnapshotUrl = (svg: string) => `data:image/svg+xml,${encodeURIComponent(drawingOnlySnapshot(svg)).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)}`;
export const embedMarkdown = (title: string, id: string) => `![${title.replace(/[\[\]\r\n]/g, " ")}](talkos-embed:${id})`;

export function portableDocumentMarkdown(content: string, embeds: DocumentEmbeds = {}): string {
  return normalizeDocumentMarkdown(content).split("\n").map((line) => {
    const match = line.match(documentEmbedPattern);
    const snapshot = match ? embeds[match[2]] : undefined;
    return snapshot ? snapshot.kind === "sheet" ? sheetSnapshotMarkdown(snapshot) : `![${match![1]}](${canvasSnapshotUrl(snapshot.svg)})` : line;
  }).join("\n");
}
