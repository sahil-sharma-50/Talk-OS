export interface DocumentSection { heading: string; level: number; start: number; bodyStart: number; end: number }
export const plainHeading = (heading: string) => heading.trim().replace(/\s+#+\s*$/, "").replace(/[*_`]/g, "").trim();

export function documentSections(content: string): DocumentSection[] {
  const sections: DocumentSection[] = [];
  const lines = content.split("\n");
  let offset = 0;
  let previousStart = 0;
  let fence = "";
  lines.forEach((line, index) => {
    const start = offset;
    offset += line.length + 1;
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = marker[1];
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length && !line.slice(marker[0].length).trim()) fence = "";
      previousStart = start;
      return;
    }
    if (fence) { previousStart = start; return; }
    const heading = line.match(/^ {0,3}(#{1,6})[ \t]+(.+?)\s*$/);
    if (heading) sections.push({ heading: plainHeading(heading[2]), level: heading[1].length, start, bodyStart: Math.min(offset, content.length), end: content.length });
    else if (/^ {0,3}(=+|-+)\s*$/.test(line) && index > 0 && lines[index - 1].trim() && !/^\s*[#>`~*-]/.test(lines[index - 1])) {
      sections.push({ heading: plainHeading(lines[index - 1]), level: line.trim()[0] === "=" ? 1 : 2, start: previousStart, bodyStart: Math.min(offset, content.length), end: content.length });
    }
    previousStart = start;
  });
  return sections.map((section, index) => ({ ...section, end: sections.slice(index + 1).find((next) => next.level <= section.level)?.start ?? content.length }));
}

export function insertDocumentContent(content: string, block: string, placement: string, heading?: string, occurrence?: number): { content: string } | { question: string; sections: string[] } {
  let at = placement === "start" ? 0 : content.length;
  if (!["start", "end", "before_section", "after_section"].includes(placement)) return { question: "Where should I place it: at the start, end, or before/after a section?", sections: [] };
  if (placement.endsWith("_section")) {
    const sections = documentSections(content);
    const matches = sections.filter((section) => section.heading.toLocaleLowerCase() === plainHeading(heading ?? "").toLocaleLowerCase());
    if (!matches.length) return { question: `I could not find the section “${heading || ""}”. Which section should I use?`, sections: sections.map((section) => section.heading) };
    if (matches.length > 1 && occurrence === undefined) return { question: `There are ${matches.length} sections named “${heading}”. Which occurrence should I use?`, sections: matches.map((section, index) => `${index + 1}: ${section.heading}`) };
    const target = matches[(occurrence ?? 1) - 1];
    if (!target) return { question: "That section occurrence does not exist. Which one should I use?", sections: matches.map((section) => section.heading) };
    at = placement === "before_section" ? target.start : target.end;
  }
  const before = content.slice(0, at); const after = content.slice(at);
  return { content: before + (before && !before.endsWith("\n\n") ? before.endsWith("\n") ? "\n" : "\n\n" : "") + block.trim() + (after ? "\n\n" : "\n") + after };
}
