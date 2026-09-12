"use client";

import { Copy, Download, MoreHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";

export function FileActionMenu({ name, onRename, onDuplicate, onExport, onTrash }: {
  name: string;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onExport: () => void;
  onTrash: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState(name);
  return <details className="file-menu" onClick={(event) => event.stopPropagation()}>
    <summary aria-label={`More options for ${name}`}><MoreHorizontal size={15} /></summary>
    <div className="file-menu__popover">
      {renaming ? <form onSubmit={(event) => { event.preventDefault(); onRename(value); setRenaming(false); }}>
        <label>File name<input autoFocus value={value} onChange={(event) => setValue(event.target.value)} /></label>
        <button type="submit">Rename</button>
      </form> : <button type="button" onClick={() => setRenaming(true)}>Rename</button>}
      <button type="button" onClick={onDuplicate}><Copy size={13} /> Duplicate</button>
      <button type="button" onClick={onExport}><Download size={13} /> Export</button>
      <button type="button" className="danger" onClick={onTrash}><Trash2 size={13} /> Move to Trash</button>
    </div>
  </details>;
}
