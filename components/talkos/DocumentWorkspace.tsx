"use client";

import { Bold, Code2, Download, Eye, FilePlus2, FileText, Heading2, Italic, Link2, List, ListOrdered, Pencil, Plus, Quote, Save, Strikethrough, Underline, Undo2, Upload } from "lucide-react";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { setWorkspaceSelection } from "@/features/workspace/workspace-context";
import { createWorkspaceDocument, duplicateArtifact, editWorkspaceDocument, moveArtifactToTrash, renameArtifact, undoWorkspaceDocument } from "@/features/workspace/workspace-model";
import { importDocumentFile } from "@/features/workspace/import-document";
import { canvasSnapshotUrl, documentEmbedPattern, portableDocumentMarkdown } from "@/features/workspace/document-embeds";
import { plainHeading } from "@/features/workspace/document-sections";
import type { DocumentEmbeds } from "@/features/workspace/workspace.types";
import type { WorkspaceSnapshot } from "@/features/workspace/workspace.types";
import type { WorkspaceDocument } from "@/features/workspace/workspace.types";
import { EditableArtifactTitle } from "./EditableArtifactTitle";
import { ArtifactNavigator, ArtifactNavigatorItem } from "./ArtifactNavigator";
import { FileActionMenu } from "./FileActionMenu";
import { WorkspaceResizeHandle } from "./WorkspaceResizeHandle";
import { DocumentSheetTable } from "./DocumentSheetTable";
import { markdownTableAt } from "@/features/workspace/markdown-table";
import { normalizeDocumentMarkdown } from "@/features/workspace/document-markdown";

interface Props { workspace: WorkspaceSnapshot; onChange: (workspace: WorkspaceSnapshot) => void }

type FormatAction = {
  label: string;
  before?: string;
  after?: string;
  placeholder?: string;
  linePrefix?: string | ((index: number) => string);
  icon: typeof Bold;
};

const formatActions: FormatAction[] = [
  { label: "Bold", before: "**", after: "**", placeholder: "bold text", icon: Bold },
  { label: "Italic", before: "_", after: "_", placeholder: "italic text", icon: Italic },
  { label: "Underline", before: "<u>", after: "</u>", placeholder: "underlined text", icon: Underline },
  { label: "Strikethrough", before: "~~", after: "~~", placeholder: "struck text", icon: Strikethrough },
  { label: "Heading", linePrefix: "## ", placeholder: "Heading", icon: Heading2 },
  { label: "Bulleted list", linePrefix: "- ", placeholder: "List item", icon: List },
  { label: "Numbered list", linePrefix: (index) => `${index + 1}. `, placeholder: "List item", icon: ListOrdered },
  { label: "Quote", linePrefix: "> ", placeholder: "Quote", icon: Quote },
  { label: "Inline code", before: "`", after: "`", placeholder: "code", icon: Code2 },
  { label: "Link", before: "[", after: "](https://)", placeholder: "link text", icon: Link2 },
];

function inlineMarkdown(value: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\\[\\`*_{}[\]()#+.!|<>~-]|<[bB][rR]\s*\/?>|\*\*.+?\*\*|~~.+?~~|<u>.+?<\/u>|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|_.+?_|\*[^*]+\*)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(value.slice(cursor, index));
    const token = match[0];
    const key = `${keyPrefix}-${index}`;
    if (token.startsWith("\\")) nodes.push(token.slice(1));
    else if (/^<br\s*\/?>$/i.test(token)) nodes.push(<br key={key} />);
    else if (token.startsWith("**")) nodes.push(<strong key={key}>{inlineMarkdown(token.slice(2, -2), key)}</strong>);
    else if (token.startsWith("~~")) nodes.push(<del key={key}>{inlineMarkdown(token.slice(2, -2), key)}</del>);
    else if (token.startsWith("<u>")) nodes.push(<u key={key}>{inlineMarkdown(token.slice(3, -4), key)}</u>);
    else if (token.startsWith("`")) nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("[")) {
      const parts = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
      nodes.push(parts ? <a key={key} href={parts[2]} target="_blank" rel="noreferrer">{parts[1]}</a> : token);
    } else nodes.push(<em key={key}>{inlineMarkdown(token.slice(1, -1), key)}</em>);
    cursor = index + token.length;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

function DocumentFigure({ src, title, embedId }: { src: string; title: string; embedId?: string }) {
  return <figure className="document-diagram" data-embed-id={embedId}>
    {/* eslint-disable-next-line @next/next/no-img-element -- Local snapshot data URLs retain their original vector size without a remote image optimizer. */}
    <img src={src} alt={title} />
    <figcaption>{title}</figcaption>
  </figure>;
}

export function MarkdownPreview({ content, embeds = {} }: { content: string; embeds?: DocumentEmbeds }) {
  const lines = normalizeDocumentMarkdown(content).split("\n");
  const blocks: ReactNode[] = [];
  let inCode = false;
  let skipUntil = -1;
  let code: string[] = [];
  lines.forEach((line, index) => {
    if (index <= skipUntil) return;
    if (line.startsWith("```")) {
      if (inCode) { blocks.push(<pre key={`code-${index}`}><code>{code.join("\n")}</code></pre>); code = []; }
      inCode = !inCode;
      return;
    }
    if (inCode) { code.push(line); return; }
    const table = markdownTableAt(lines, index);
    if (table) {
      blocks.push(<div className="document-sheet document-markdown-table" key={`table-${index}`}><div className="document-sheet__scroll" role="region" aria-label="Document table" tabIndex={0}><table>
        <thead><tr>{table.headings.map((cell, column) => <th scope="col" key={column} style={{ textAlign: table.alignments[column] }}>{inlineMarkdown(cell, `th-${index}-${column}`)}</th>)}</tr></thead>
        <tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, column) => <td key={column} style={{ textAlign: table.alignments[column], whiteSpace: /^\d{4}-\d{2}-\d{2}$/.test(cell) ? "nowrap" : undefined }}>{inlineMarkdown(cell, `td-${index}-${rowIndex}-${column}`)}</td>)}</tr>)}</tbody>
      </table></div></div>);
      skipUntil = table.lastLine; return;
    }
    const embedded = line.match(documentEmbedPattern);
    if (embedded) {
      const snapshot = embeds[embedded[2]];
      blocks.push(snapshot ? snapshot.kind === "sheet" ? <DocumentSheetTable snapshot={snapshot} key={`sheet-${index}`} /> : <DocumentFigure src={canvasSnapshotUrl(snapshot.svg)} title={snapshot.title} embedId={snapshot.id} key={`diagram-${index}`} /> : <p key={`missing-snapshot-${index}`}>Snapshot unavailable.</p>);
      return;
    }
    const portableImage = line.match(/^!\[([^\]\n]*)\]\((data:image\/(?:svg\+xml|png|jpeg|webp|gif)(?:;base64)?,[^\s)]+)\)\s*$/);
    if (portableImage) { blocks.push(<DocumentFigure src={portableImage[2]} title={portableImage[1]} key={`image-${index}`} />); return; }
    if (!line.trim()) { if (index > 0 && lines[index - 1].trim()) blocks.push(<span className="markdown-spacer" key={`space-${index}`} />); return; }
    const underline = lines[index + 1]?.match(/^ {0,3}(=+|-+)\s*$/);
    if (underline && !/^\s*[#>`~*-]/.test(line)) {
      const Tag = underline[1][0] === "=" ? "h1" : "h2";
      blocks.push(<Tag data-section-heading={plainHeading(line)} key={`heading-${index}`}>{inlineMarkdown(line, `heading-${index}`)}</Tag>);
      skipUntil = index + 1; return;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const Tag = `h${heading[1].length}` as keyof React.JSX.IntrinsicElements;
      blocks.push(<Tag data-section-heading={plainHeading(heading[2])} key={`heading-${index}`}>{inlineMarkdown(heading[2], `heading-${index}`)}</Tag>);
      return;
    }
    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    const bullet = line.match(/^[-*+]\s+(.+)$/);
    if (ordered || bullet) {
      const pattern = ordered ? /^\d+[.)]\s+(.+)$/ : /^[-*+]\s+(.+)$/;
      const items: string[] = [];
      for (let next = index; next < lines.length; next++) {
        const item = lines[next].match(pattern);
        if (!item) break;
        items.push(item[1]); skipUntil = next;
      }
      const Tag = ordered ? "ol" : "ul";
      const sources = items.every(item => /^\[[^\]]+\]\(https?:\/\/[^)\s]+\)[.]?$/.test(item));
      blocks.push(<Tag key={`list-${index}`} {...(ordered ? { start: Number(line.match(/^\d+/)?.[0] ?? 1) } : {})} className={sources ? "document-source-list" : undefined}>{items.map((item, offset) => <li key={offset}>{inlineMarkdown(item, `list-${index}-${offset}`)}</li>)}</Tag>);
      return;
    }
    if (line.startsWith("> ")) { blocks.push(<blockquote key={`quote-${index}`}>{inlineMarkdown(line.slice(2), `quote-${index}`)}</blockquote>); return; }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { blocks.push(<hr key={`rule-${index}`} />); return; }
    blocks.push(<p key={`paragraph-${index}`}>{inlineMarkdown(line, `paragraph-${index}`)}</p>);
  });
  if (code.length) blocks.push(<pre key="code-final"><code>{code.join("\n")}</code></pre>);
  return <Fragment>{blocks}</Fragment>;
}

function download(name: string, content: string, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}

export function DocumentWorkspace({ workspace, onChange }: Props) {
  const active = workspace.documents.find((document) => document.id === workspace.activeDocumentId) ?? workspace.documents[0];
  const [message, setMessage] = useState("");
  const uploadRef = useRef<HTMLInputElement>(null);
  const latestRef = useRef({ workspace, onChange });
  useEffect(() => { latestRef.current = { workspace, onChange }; }, [workspace, onChange]);
  if (!active) return <div className="tool-empty"><FilePlus2 size={30} /><h2>Create your first document</h2><p>Write here or ask TalkOS to draft it with you.</p><button type="button" onClick={() => onChange(createWorkspaceDocument(workspace, "Untitled document"))}><FilePlus2 size={14} /> Create a document</button></div>;
  const importFile = async (file?: File) => {
    if (!file) return;
    setMessage("Importing document…");
    try {
      const imported = await importDocumentFile(file);
      const latest = latestRef.current;
      latest.onChange(createWorkspaceDocument(latest.workspace, imported.title, imported.content, imported.kind));
      setMessage("");
    } catch (error) {
      const code = error instanceof Error ? error.message : "import_failed";
      setMessage(code === "pdf_has_no_text" ? "That PDF has no selectable text. Export it as text first." : `Could not import: ${code.replaceAll("_", " ")}.`);
    }
  };

  return <div className="document-workspace">
    <ArtifactNavigator label="Documents" count={workspace.documents.length} countLabel={`${workspace.documents.length} documents`} actions={<>
        <button type="button" onClick={() => onChange(createWorkspaceDocument(workspace, "Untitled document"))}><Plus size={14} /> New</button>
        <button type="button" aria-label="Import document" title="Import document" onClick={() => uploadRef.current?.click()}><Upload size={14} /></button>
        <input ref={uploadRef} aria-label="Choose document file" className="visually-hidden" type="file" accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf" onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ""; }} />
      </>}>
      {workspace.documents.map((document) => <ArtifactNavigatorItem active={document.id === active.id} icon={FileText} title={document.title} meta={`${document.kind === "import" ? "Imported" : document.kind[0].toUpperCase() + document.kind.slice(1)} · Revision ${document.revision}`} key={document.id} onSelect={() => onChange({ ...workspace, activeDocumentId: document.id })} menu={<FileActionMenu name={document.title} kind="document" onRename={(title) => onChange(renameArtifact(workspace, "document", document.id, title))} onDuplicate={() => onChange(duplicateArtifact(workspace, "document", document.id))} onTrash={() => onChange(moveArtifactToTrash(workspace, "document", document.id))} onExport={() => download(`${document.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`, portableDocumentMarkdown(document.content, document.embeds))} />} />)}
    </ArtifactNavigator>
    <DocumentEditor key={active.id} document={active} workspace={workspace} onChange={onChange} importMessage={message} />
    <WorkspaceResizeHandle />
  </div>;
}

function DocumentEditor({ document, workspace, onChange, importMessage }: { document: WorkspaceDocument; workspace: WorkspaceSnapshot; onChange: (workspace: WorkspaceSnapshot) => void; importMessage: string }) {
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const mode = workspace.documentView?.documentId === document.id ? workspace.documentView.mode : "source";
  const setMode = (mode: "source" | "preview") => onChange({ ...workspace, documentView: { documentId: document.id, mode } });
  const previewRef = useRef<HTMLElement>(null);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [draft, setDraft] = useState({
    content: document.content,
    message: "",
    baseRevision: document.revision,
    baseContent: document.content,
    ...workspace.documentDrafts?.[document.id],
  });
  const currentDraft = workspace.documentDrafts?.[document.id] ?? { content: document.content, baseContent: document.content, baseRevision: document.revision, embeds: document.embeds };
  const content = currentDraft.content === currentDraft.baseContent ? document.content : currentDraft.content;
  const embeds = currentDraft.content === currentDraft.baseContent ? document.embeds : currentDraft.embeds ?? document.embeds;
  const requestedView = workspace.documentView;
  useEffect(() => {
    const preview = previewRef.current;
    if (!preview || requestedView?.documentId !== document.id || requestedView.mode !== "preview") return;
    const target = requestedView.embedId
      ? Array.from(preview.querySelectorAll<HTMLElement>("[data-embed-id]")).find((element) => element.dataset.embedId === requestedView.embedId)
      : Array.from(preview.querySelectorAll<HTMLElement>("[data-section-heading]")).find((element) => element.dataset.sectionHeading?.toLocaleLowerCase() === plainHeading(requestedView.section ?? "").toLocaleLowerCase());
    if (target) preview.scrollTop += target.getBoundingClientRect().top - preview.getBoundingClientRect().top - 24;
  }, [requestedView, document.id]);
  const conflict = content !== document.content && currentDraft.baseContent !== document.content;
  const message = conflict ? "The saved version changed. Choose which version to keep." : draft.message;
  const updateDraft = (nextContent: string) => {
    const nextDraft = { content: nextContent, embeds, baseRevision: currentDraft.content === currentDraft.baseContent ? document.revision : currentDraft.baseRevision, baseContent: currentDraft.content === currentDraft.baseContent ? document.content : currentDraft.baseContent };
    setDraft({ ...nextDraft, message: "" });
    onChange({ ...workspace, documentDrafts: { ...workspace.documentDrafts, [document.id]: nextDraft } });
  };
  const clearDraft = (nextWorkspace: WorkspaceSnapshot) => {
    const drafts = { ...nextWorkspace.documentDrafts };
    delete drafts[document.id];
    const saved = nextWorkspace.documents.find((item) => item.id === document.id)!;
    setDraft({ content: saved.content, baseContent: saved.content, baseRevision: saved.revision, message: "" });
    onChange({ ...nextWorkspace, documentDrafts: drafts });
  };
  const dirty = content !== document.content;
  const save = () => {
    const result = editWorkspaceDocument(workspace, document.id, content, document.revision, "user", undefined, embeds);
    if (!result.ok) { setDraft((current) => ({ ...current, message: "This document changed while you were editing. Review it and try again." })); return; }
    clearDraft(result.workspace);
  };
  const isFormatActive = (action: FormatAction) => {
    const { start, end } = selection;
    if (end <= start) return false;
    if (action.linePrefix) {
      const linePrefix = action.linePrefix;
      const lineStart = content.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
      const nextBreak = content.indexOf("\n", end);
      const lineEnd = nextBreak === -1 ? content.length : nextBreak;
      const lines = content.slice(lineStart, lineEnd).split("\n").filter(Boolean);
      return Boolean(lines.length) && lines.every((line) => typeof linePrefix === "function" ? /^\d+\.\s/.test(line) : line.startsWith(linePrefix));
    }
    const before = action.before ?? "";
    const after = action.after ?? "";
    const selected = content.slice(start, end);
    return Boolean(before || after) && (
      (content.slice(Math.max(0, start - before.length), start) === before && content.slice(end, end + after.length) === after)
      || (selected.startsWith(before) && selected.endsWith(after))
    );
  };
  const format = (action: FormatAction) => {
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const selected = content.slice(start, end) || action.placeholder || "text";
    let next = content;
    let selectionStart = start;
    let selectionEnd = start;
    if (action.linePrefix) {
      const linePrefix = action.linePrefix;
      const lineStart = content.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
      const nextBreak = content.indexOf("\n", end);
      const lineEnd = nextBreak === -1 ? content.length : nextBreak;
      const block = content.slice(lineStart, lineEnd) || selected;
      const lines = block.split("\n");
      const active = lines.filter(Boolean).every((line) => typeof linePrefix === "function" ? /^\d+\.\s/.test(line) : line.startsWith(linePrefix));
      const formatted = lines.map((line, index) => active
        ? typeof linePrefix === "function" ? line.replace(/^\d+\.\s/, "") : line.slice(linePrefix.length)
        : `${typeof linePrefix === "function" ? linePrefix(index) : linePrefix}${line || action.placeholder}`
      ).join("\n");
      next = `${content.slice(0, lineStart)}${formatted}${content.slice(lineEnd)}`;
      selectionStart = lineStart;
      selectionEnd = lineStart + formatted.length;
    } else {
      const before = action.before ?? "";
      const after = action.after ?? "";
      const wrapsSelection = content.slice(Math.max(0, start - before.length), start) === before && content.slice(end, end + after.length) === after;
      const selectionIncludesWrap = selected.startsWith(before) && selected.endsWith(after) && selected.length >= before.length + after.length;
      if (wrapsSelection) {
        next = `${content.slice(0, start - before.length)}${selected}${content.slice(end + after.length)}`;
        selectionStart = start - before.length;
        selectionEnd = selectionStart + selected.length;
      } else if (selectionIncludesWrap) {
        const unwrapped = selected.slice(before.length, selected.length - after.length);
        next = `${content.slice(0, start)}${unwrapped}${content.slice(end)}`;
        selectionStart = start;
        selectionEnd = start + unwrapped.length;
      } else {
        next = `${content.slice(0, start)}${before}${selected}${after}${content.slice(end)}`;
        selectionStart = start + before.length;
        selectionEnd = selectionStart + selected.length;
      }
    }
    updateDraft(next);
    setSelection({ start: selectionStart, end: selectionEnd });
    requestAnimationFrame(() => { editor.focus(); editor.setSelectionRange(selectionStart, selectionEnd); });
  };
  return <article className="document-editor">
    <header><EditableArtifactTitle title={document.title} ariaLabel="Document title" onCommit={(title) => onChange(renameArtifact(workspace, "document", document.id, title))} /><div>
      <button type="button" onClick={() => onChange(undoWorkspaceDocument(workspace, document.id))} disabled={!document.history.length}><Undo2 size={14} /> Undo</button>
      <button type="button" onClick={() => download(`${(document.title || "document").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`, portableDocumentMarkdown(content, embeds))}><Download size={14} /> Export</button>
      <button className="primary-action" type="button" onClick={save} disabled={!dirty || conflict}><Save size={14} /> Save</button>
    </div></header>
    <div className="document-formatbar" role="toolbar" aria-label="Document formatting">
      <div>{formatActions.map(({ icon: Icon, ...action }) => <button key={action.label} type="button" aria-label={action.label} aria-pressed={isFormatActive({ ...action, icon: Icon })} title={action.label} onClick={() => format({ ...action, icon: Icon })} disabled={mode === "preview"}><Icon size={15} /></button>)}</div>
      <div className="document-mode" aria-label="Document view">
        <button type="button" aria-label="Edit document source" title="Edit Markdown" aria-pressed={mode === "source"} onClick={() => setMode("source")}><Pencil size={14} /> Edit</button>
        <button type="button" aria-label="Preview document" title="Preview formatted document" aria-pressed={mode === "preview"} onClick={() => setMode("preview")}><Eye size={14} /> Preview</button>
      </div>
    </div>
    {mode === "source" ? <textarea ref={editorRef} aria-label="Document content" spellCheck="true" value={content} onChange={(event) => updateDraft(event.target.value)} onSelect={(event) => { const start = event.currentTarget.selectionStart; const end = event.currentTarget.selectionEnd; setSelection({ start, end }); setWorkspaceSelection({ kind: "document", artifactId: document.id, start, end, text: content.slice(start, end) }); }} onKeyUp={(event) => setSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })} placeholder="Write notes here, or ask the voice agent to research and draft…" /> : <section ref={previewRef} className="document-preview" tabIndex={0} role="region" aria-label="Document preview"><MarkdownPreview content={content} embeds={embeds} /></section>}
    <footer><span>{content.trim() ? content.trim().split(/\s+/).length : 0} words · revision {document.revision}</span><span aria-live="polite">{message || importMessage || (dirty ? "Draft saved locally · Save to update the document" : "Saved in this browser")}</span>{conflict ? <span className="draft-actions"><button type="button" onClick={() => clearDraft(workspace)}>Use saved version</button><button type="button" onClick={save}>Save my version</button></span> : null}</footer>
  </article>;
}
