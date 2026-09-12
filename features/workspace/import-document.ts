import type { DocumentKind } from "./workspace.types";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_PDF_PAGES = 50;

export interface ImportedDocument {
  title: string;
  content: string;
  kind: DocumentKind;
}

function titleFromFilename(filename: string) {
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim() || "Imported document";
}

async function readPdf(file: File) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  if (pdf.numPages > MAX_PDF_PAGES) throw new Error("pdf_page_limit");

  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const text = await page.getTextContent();
    pages.push(text.items
      .map((item) => "str" in item ? item.str : "")
      .filter(Boolean)
      .join(" "));
  }

  const content = pages.join("\n\n").trim();
  if (!content) throw new Error("pdf_has_no_text");
  return content;
}

export async function importDocumentFile(file: File): Promise<ImportedDocument> {
  if (file.size > MAX_FILE_BYTES) throw new Error("file_too_large");
  const extension = file.name.split(".").at(-1)?.toLowerCase();
  const isText = extension === "txt" || extension === "md" || extension === "markdown";
  const isPdf = extension === "pdf" || file.type === "application/pdf";
  if (!isText && !isPdf) throw new Error("unsupported_file_type");

  return {
    title: titleFromFilename(file.name),
    content: isPdf ? await readPdf(file) : await file.text(),
    kind: "import",
  };
}
