import { expect, it } from "vitest";
import { normalizeDocumentMarkdown } from "./document-markdown";
import { portableDocumentMarkdown } from "./document-embeds";

it("repairs escaped layout next to source links without rewriting paths or destinations", () => {
  const input = String.raw`Keep C:\notes\new.\n\n## Sources\n\* [A](https://example.com/a?q=%5Cn)\n\* [B](https://example.com/b)\n`;
  const output = normalizeDocumentMarkdown(input);
  expect(output).toBe("Keep C:\\notes\\new.\n\n## Sources\n* [A](https://example.com/a?q=%5Cn)\n* [B](https://example.com/b)\n");
  expect(normalizeDocumentMarkdown(output)).toBe(output);
  expect(portableDocumentMarkdown(input)).toBe(output);
});

it.each([
  String.raw`Write \n to represent a newline. C:\notes\new \* literal star`,
  "`" + String.raw`\n\n## Sources\n\* [A](https://example.com)` + "`",
  "``" + String.raw`example with \n## Heading and a ` + "` inside``",
  "```md\n" + String.raw`\n## Sources\n\* [A](https://example.com)` + "\n```",
  "~~~md\n" + String.raw`\n## Sources\n\* [A](https://example.com)` + "\n~~~",
  "    " + String.raw`\n## Sources\n\* [A](https://example.com)`,
  String.raw`[Literal \n## Heading](https://example.com/\notes)`,
  String.raw`\\n## Intentionally escaped`,
  "## Sources\n\\* [Literal star](https://example.com)",
])("preserves literal examples and valid Markdown: %s", input => {
  expect(normalizeDocumentMarkdown(input)).toBe(input);
});

it("supports escaped CRLF layout and repairs only prose outside code", () => {
  const code = "```md\n" + String.raw`\n## Literal` + "\n```\n";
  expect(normalizeDocumentMarkdown(code + String.raw`\r\n## Sources\r\n- [A](https://example.com)`)).toBe(code + "\n## Sources\n- [A](https://example.com)");
});
