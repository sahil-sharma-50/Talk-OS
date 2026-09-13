"use client";

import { Download, MoreHorizontal, Trash2 } from "lucide-react";
import { useDismissibleDetails } from "./useDismissibleDetails";

export function ResearchActionMenu({ label, kind, onDownload, onDelete }: {
  label: string;
  kind: "saved search" | "result";
  onDownload: () => void;
  onDelete: () => void;
}) {
  const detailsRef = useDismissibleDetails();
  const runAndClose = (action: () => void) => {
    action();
    if (detailsRef.current) detailsRef.current.open = false;
  };

  return <details ref={detailsRef} className="file-menu research-action-menu" onClick={(event) => event.stopPropagation()}>
    <summary role="button" aria-label={`More options for ${kind} ${label}`}><MoreHorizontal size={16} /></summary>
    <div className="file-menu__popover">
      <button type="button" aria-label={`Download ${kind}`} onClick={() => runAndClose(onDownload)}><Download size={13} /> Download</button>
      <button type="button" aria-label={`Delete ${kind}`} className="danger" onClick={() => runAndClose(onDelete)}><Trash2 size={13} /> Delete</button>
    </div>
  </details>;
}
