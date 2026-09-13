"use client";

import { Check, Copy, Download, MoreHorizontal, Pencil, Trash2, X } from "lucide-react";
import { useState } from "react";
import { useDismissibleDetails } from "./useDismissibleDetails";

export function FileActionMenu({ name, kind = "item", onRename, onDuplicate, onExport, onTrash }: {
  name: string;
  kind?: "document" | "sheet" | "plan" | "canvas" | "dashboard" | "item";
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onExport: () => void;
  onTrash: () => void;
}) {
  const detailsRef = useDismissibleDetails();
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState(name);

  const close = () => {
    if (detailsRef.current) detailsRef.current.open = false;
    setRenaming(false);
  };
  const runAndClose = (action: () => void) => {
    action();
    close();
  };

  return <details ref={detailsRef} className="file-menu" data-mode={renaming ? "rename" : "actions"} onClick={(event) => event.stopPropagation()} onToggle={(event) => {
    if (!event.currentTarget.open) setRenaming(false);
  }}>
    <summary aria-label={`More options for ${name}`}><MoreHorizontal size={15} /></summary>
    <div className="file-menu__popover">
      {renaming ? <form className="file-menu__rename" onSubmit={(event) => {
        event.preventDefault();
        const nextName = value.trim();
        if (!nextName) return;
        onRename(nextName);
        close();
      }}>
        <header><Pencil size={15} aria-hidden="true" /><h3>Rename {kind}</h3><button type="button" aria-label="Cancel rename" onClick={() => { setValue(name); setRenaming(false); }}><X size={15} /></button></header>
        <label><span>Name</span><input aria-label="Name" autoFocus value={value} onChange={(event) => setValue(event.target.value)} /></label>
        <div><button type="button" onClick={() => { setValue(name); setRenaming(false); }}>Cancel</button><button type="submit" className="primary" aria-label="Save name" disabled={!value.trim()}><Check size={14} /> Save</button></div>
      </form> : <>
        <button type="button" onClick={() => { setValue(name); setRenaming(true); }}><Pencil size={13} /> Rename</button>
        <button type="button" onClick={() => runAndClose(onDuplicate)}><Copy size={13} /> Duplicate</button>
        <button type="button" onClick={() => runAndClose(onExport)}><Download size={13} /> Export</button>
        <button type="button" className="danger" onClick={() => runAndClose(onTrash)}><Trash2 size={13} /> Move to Trash</button>
      </>}
    </div>
  </details>;
}
