export interface MarkdownTable {
  headings: string[];
  alignments: Array<"left" | "center" | "right">;
  rows: string[][];
  lastLine: number;
}

function cells(line: string): string[] | null {
  const result: string[] = [];
  let cell = "", pipes = 0;
  const source = line.trim();
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\\" && index + 1 < source.length) { cell += source[index] + source[++index]; continue; }
    if (source[index] === "|") { result.push(cell.trim()); cell = ""; pipes += 1; }
    else cell += source[index];
  }
  if (!pipes) return null;
  result.push(cell.trim());
  if (source.startsWith("|")) result.shift();
  if (result.at(-1) === "" && source.endsWith("|")) result.pop();
  return result;
}

export function markdownTableAt(lines: string[], start: number): MarkdownTable | null {
  const headings = cells(lines[start]);
  const delimiter = lines[start + 1] ? cells(lines[start + 1]) : null;
  if (!headings?.length || !delimiter || headings.length !== delimiter.length || !delimiter.every(value => /^:?-{3,}:?$/.test(value))) return null;
  const alignments = delimiter.map((value): "left" | "center" | "right" => value.endsWith(":") ? value.startsWith(":") ? "center" : "right" : "left");
  const clean = (value: string) => value.replace(/^(?:\s*<br\s*\/?>)+|(?:<br\s*\/?>\s*)+$/gi, "").trim();
  const rows: string[][] = [];
  let lastLine = start + 1;
  for (let index = start + 2; index < lines.length; index += 1) {
    const row = cells(lines[index]);
    if (!row || !lines[index].trim()) break;
    rows.push(headings.map((_, column) => clean(row[column] ?? "")));
    lastLine = index;
  }
  return { headings: headings.map(clean), alignments, rows, lastLine };
}
