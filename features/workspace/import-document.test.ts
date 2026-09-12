import { describe, expect, it } from "vitest";
import { importDocumentFile } from "./import-document";

describe("document import", () => {
  it("imports UTF-8 text and derives a readable title", async () => {
    const file = new File(["# Useful notes\nA concrete fact."], "market-notes.md", { type: "text/markdown" });
    await expect(importDocumentFile(file)).resolves.toEqual({
      title: "market notes",
      content: "# Useful notes\nA concrete fact.",
      kind: "import",
    });
  });

  it("rejects unsupported files", async () => {
    const file = new File(["x"], "photo.png", { type: "image/png" });
    await expect(importDocumentFile(file)).rejects.toThrow("unsupported_file_type");
  });
});
