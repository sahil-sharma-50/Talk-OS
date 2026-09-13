"use client";

import { Bold, Code2, Download, Eye, FilePlus2, FileText, Heading2, Italic, Link2, List, ListOrdered, Pencil, Plus, Quote, Save, Strikethrough, Underline, Undo2, Upload } from "lucide-react";
import { Fragment, useRef, useState, type ReactNode } from "react";
import { createWorkspaceDocument, duplicateArtifact, editWorkspaceDocument, moveArtifactToTrash, renameArtifact, undoWorkspaceDocument } from "@/features/workspace/workspace-model";
import { importDocumentFile } from "@/features/workspace/import-document";
import type { WorkspaceSnapshot } from "@/features/workspace/workspace.types";
import type { WorkspaceDocument } from "@/features/workspace/workspace.types";
import { EditableArtifactTitle } from "./EditableArtifactTitle";
import { ArtifactNavigator, ArtifactNavigatorItem } from "./ArtifactNavigator";
import { FileActionMenu } from "./FileActionMenu";
import { WorkspaceResizeHandle } from "./WorkspaceResizeHandle";

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
  const pattern = /(\*\*.+?\*\*|~~.+?~~|<u>.+?<\/u>|`[^`]+`|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|_.+?_|\*[^*]+\*)/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(value.slice(cursor, index));
    const token = match[0];
    const key = `${keyPrefix}-${index}`;
    if (token.startsWith("**")) nodes.push(<strong key={key}>{inlineMarkdown(token.slice(2, -2), key)}</strong>);
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

function MarkdownPreview({ content }: { content: string }) {
  const lines = content.split("\n");
  const blocks: ReactNode[] = [];
  let inCode = false;
  let code: string[] = [];
  lines.forEach((line, index) => {
    if (line.startsWith("```")) {
      if (inCode) { blocks.push(<pre key={`code-${index}`}><code>{code.join("\n")}</code></pre>); code = []; }
      inCode = !inCode;
      return;
    }
    if (inCode) { code.push(line); return; }
    if (!line.trim()) { blocks.push(<span className="markdown-spacer" key={`space-${index}`} />); return; }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const Tag = `h${heading[1].length}` as keyof React.JSX.IntrinsicElements;
      blocks.push(<Tag key={`heading-${index}`}>{inlineMarkdown(heading[2], `heading-${index}`)}</Tag>);
      return;
    }
    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) { blocks.push(<ol key={`ol-${index}`}><li>{inlineMarkdown(ordered[1], `ol-${index}`)}</li></ol>); return; }
    const bullet = line.match(/^[-*]\s+(.+)$/);
    if (bullet) { blocks.push(<ul key={`ul-${index}`}><li>{inlineMarkdown(bullet[1], `ul-${index}`)}</li></ul>); return; }
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
  if (!active) return <div className="tool-empty"><FilePlus2 size={30} /><h2>Create your first document</h2><p>Write here or ask TalkOS to draft it with you.</p><button type="button" onClick={() => onChange(createWorkspaceDocument(workspace, "Untitled document"))}><FilePlus2 size={14} /> Create a document</button></div>;
  const importFile = async (file?: File) => {
    if (!file) return;
    try {
      const imported = await importDocumentFile(file);
      onChange(createWorkspaceDocument(workspace, imported.title, imported.content, imported.kind));
    } catch (error) {
      const code = error instanceof Error ? error.message : "import_failed";
      setMessage(code === "pdf_has_no_text" ? "That PDF has no selectable text. Export it as text first." : `Could not import: ${code.replaceAll("_", " ")}.`);
    }
  };

  return <div className="document-workspace">
    <ArtifactNavigator label="Documents" count={workspace.documents.length} countLabel={`${workspace.documents.length} documents`} actions={<>
        <button type="button" onClick={() => onChange(createWorkspaceDocument(workspace, "Untitled document"))}><Plus size={14} /> New</button>
        <button type="button" aria-label="Import document" title="Import document" onClick={() => uploadRef.current?.click()}><Upload size={14} /></button>
        <input ref={uploadRef} className="visually-hidden" type="file" accept=".txt,.md,.markdown,.pdf,text/plain,text/markdown,application/pdf" onChange={(event) => { void importFile(event.target.files?.[0]); event.target.value = ""; }} />
      </>}>
      {workspace.documents.map((document) => <ArtifactNavigatorItem active={document.id === active.id} icon={FileText} title={document.title} meta={`${document.kind === "import" ? "Imported" : document.kind[0].toUpperCase() + document.kind.slice(1)} · Revision ${document.revision}`} key={document.id} onSelect={() => onChange({ ...workspace, activeDocumentId: document.id })} menu={<FileActionMenu name={document.title} kind="document" onRename={(title) => onChange(renameArtifact(workspace, "document", document.id, title))} onDuplicate={() => onChange(duplicateArtifact(workspace, "document", document.id))} onTrash={() => onChange(moveArtifactToTrash(workspace, "document", document.id))} onExport={() => download(`${document.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`, document.content)} />} />)}
    </ArtifactNavigator>
    <DocumentEditor key={active.id} document={active} workspace={workspace} onChange={onChange} importMessage={message} />
    <WorkspaceResizeHandle />
  </div>;
}

function DocumentEditor({ document, workspace, onChange, importMessage }: { document: WorkspaceDocument; workspace: WorkspaceSnapshot; onChange: (workspace: WorkspaceSnapshot) => void; importMessage: string }) {
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<"source" | "preview">("source");
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [draft, setDraft] = useState({
    content: document.content,
    message: "",
    baseRevision: document.revision,
    baseContent: document.content,
  });
  if (document.revision !== draft.baseRevision) {
    const savedDraft = draft.content === document.content;
    const untouchedDraft = draft.content === draft.baseContent;
    setDraft({
      content: untouchedDraft ? document.content : draft.content,
      message: savedDraft ? "" : untouchedDraft ? "Updated by TalkOS" : "TalkOS updated the saved version. Your unsaved draft is still here; save to review the conflict.",
      baseRevision: document.revision,
      baseContent: document.content,
    });
  }
  const { content, message } = draft;
  const dirty = content !== document.content;
  const save = () => {
    const result = editWorkspaceDocument(workspace, document.id, content, document.revision, "user");
    if (!result.ok) { setDraft((current) => ({ ...current, message: "This document changed while you were editing. Review it and try again." })); return; }
    onChange(result.workspace);
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
    setDraft((current) => ({ ...current, content: next }));
    setSelection({ start: selectionStart, end: selectionEnd });
    requestAnimationFrame(() => { editor.focus(); editor.setSelectionRange(selectionStart, selectionEnd); });
  };
  return <article className="document-editor">
    <header><EditableArtifactTitle title={document.title} ariaLabel="Document title" onCommit={(title) => onChange(renameArtifact(workspace, "document", document.id, title))} /><div>
      <button type="button" onClick={() => onChange(undoWorkspaceDocument(workspace, document.id))} disabled={!document.history.length}><Undo2 size={14} /> Undo</button>
      <button type="button" onClick={() => download(`${(document.title || "document").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.md`, content)}><Download size={14} /> Export</button>
      <button className="primary-action" type="button" onClick={save} disabled={!dirty}><Save size={14} /> Save</button>
    </div></header>
    <div className="document-formatbar" role="toolbar" aria-label="Document formatting">
      <div>{formatActions.map(({ icon: Icon, ...action }) => <button key={action.label} type="button" aria-label={action.label} aria-pressed={isFormatActive({ ...action, icon: Icon })} title={action.label} onClick={() => format({ ...action, icon: Icon })} disabled={mode === "preview"}><Icon size={15} /></button>)}</div>
      <div className="document-mode" aria-label="Document view">
        <button type="button" aria-label="Edit document source" title="Edit Markdown" aria-pressed={mode === "source"} onClick={() => setMode("source")}><Pencil size={14} /> Edit</button>
        <button type="button" aria-label="Preview document" title="Preview formatted document" aria-pressed={mode === "preview"} onClick={() => setMode("preview")}><Eye size={14} /> Preview</button>
      </div>
    </div>
    {mode === "source" ? <textarea ref={editorRef} aria-label="Document content" spellCheck="true" value={content} onChange={(event) => setDraft((current) => ({ ...current, content: event.target.value }))} onSelect={(event) => setSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })} onKeyUp={(event) => setSelection({ start: event.currentTarget.selectionStart, end: event.currentTarget.selectionEnd })} placeholder="Write notes here, or ask the voice agent to research and draft…" /> : <section className="document-preview" role="region" aria-label="Document preview"><MarkdownPreview content={content} /></section>}
    <footer><span>{content.trim() ? content.trim().split(/\s+/).length : 0} words · revision {document.revision}</span><span aria-live="polite">{message || importMessage || (dirty ? "Unsaved changes" : "Saved in this browser")}</span></footer>
  </article>;
}
