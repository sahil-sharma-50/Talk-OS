/** Repair double-escaped layout from agent tool arguments, not arbitrary string
 * escapes. Code, paths, URLs and intentional Markdown escapes stay literal. */
export function normalizeDocumentMarkdown(content: string): string {
  const repairLayout = (text: string) => {
    const repaired = text.replace(/(?<!\\)(?:\\r\\n|\\n)+(?=[ \t]{0,3}(?:#{1,6}[ \t]+|\\?[-*+][ \t]+|\d+[.)][ \t]+))/g, breaks =>
      "\n".repeat((breaks.match(/\\n/g) ?? []).length));
    if (repaired === text) return text;
    return repaired.replace(/(^|\n)([ \t]{0,3})\\([-*+])(?=[ \t]+)/g, "$1$2$3");
  };
  let fence: { marker: string; length: number } | undefined;
  return content.split("\n").map(line => {
    const delimiter = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (fence) {
      if (delimiter && delimiter[1][0] === fence.marker && delimiter[1].length >= fence.length && !delimiter[2].trim()) fence = undefined;
      return line;
    }
    if (delimiter) { fence = { marker: delimiter[1][0], length: delimiter[1].length }; return line; }
    if (/^( {4}|\t)/.test(line)) return line;
    // Preserve inline code and links verbatim while repairing surrounding layout.
    const protectedText = /(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)|\[[^\]]*\]\(https?:\/\/[^\s)]+\)/g;
    let result = "", cursor = 0;
    for (const match of line.matchAll(protectedText)) {
      result += repairLayout(line.slice(cursor, match.index)) + match[0];
      cursor = match.index + match[0].length;
    }
    result += repairLayout(line.slice(cursor));
    return result !== line ? result.replace(/(?<!\\)(?:\\r\\n|\\n)+$/g, "\n") : result;
  }).join("\n");
}
