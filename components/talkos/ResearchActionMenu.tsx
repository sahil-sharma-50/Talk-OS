"use client";

import { Download, MoreHorizontal, Trash2 } from "lucide-react";

export function ResearchActionMenu({ label, kind, onDownload, onDelete }: {
  label: string;
  kind: "saved search" | "result";
  onDownload: () => void;
  onDelete: () => void;
}) {
  return <details className="file-menu research-action-menu" onClick={(event) => event.stopPropagation()}>
    <summary role="button" aria-label={`More options for ${kind} ${label}`}><MoreHorizontal size={16} /></summary>
    <div className="file-menu__popover">
      <button type="button" aria-label={`Download ${kind}`} onClick={onDownload}><Download size={13} /> Download</button>
      <button type="button" aria-label={`Delete ${kind}`} className="danger" onClick={onDelete}><Trash2 size={13} /> Delete</button>
    </div>
  </details>;
}
