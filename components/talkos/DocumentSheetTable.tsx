import type { CSSProperties } from "react";
import { snapshotCellStyle } from "@/features/workspace/sheet-snapshot";
import type { SheetDocumentEmbed, SheetSnapshotCell } from "@/features/workspace/workspace.types";

function cellStyle(cell: SheetSnapshotCell, numericHeading = false): CSSProperties {
  const style = snapshotCellStyle(cell.style);
  const background = style?.background;
  // Explicit sheet fills retain a readable foreground in either document theme.
  const channels = background?.slice(1).match(/../g)?.map(part => {
    const value = parseInt(part, 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  const foreground = channels && (channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722 > .179 ? "#111111" : "#ffffff");
  return { textAlign: style?.align ?? (cell.numeric || numericHeading ? "right" : "left"), fontWeight: style?.bold ? 700 : undefined,
    fontStyle: style?.italic ? "italic" : undefined, textDecoration: style?.underline ? "underline" : undefined,
    whiteSpace: cell.numeric ? "nowrap" : undefined, color: style?.color ?? foreground ?? undefined, backgroundColor: background };
}

export function DocumentSheetTable({ snapshot }: { snapshot: SheetDocumentEmbed }) {
  const row = (cells: SheetSnapshotCell[], header = false) => <tr key={cells[0]?.address}>{cells.map((cell, column) => {
    const Tag = header ? "th" : "td";
    return <Tag key={cell.address} scope={header ? "col" : undefined} style={cellStyle(cell, header && snapshot.rows.slice(1).some(row => row[column]?.numeric))}>{cell.text}</Tag>;
  })}</tr>;
  return <figure className="document-sheet" data-embed-id={snapshot.id}>
    <div className="document-sheet__scroll" role="region" aria-label={`${snapshot.title} table`} tabIndex={0}>
      <table>
        <caption>{snapshot.title}{" "}<span>{snapshot.range}</span></caption>
        {snapshot.headerRow ? <thead>{row(snapshot.rows[0], true)}</thead> : null}
        <tbody>{(snapshot.headerRow ? snapshot.rows.slice(1) : snapshot.rows).map(cells => row(cells))}</tbody>
      </table>
    </div>
  </figure>;
}
