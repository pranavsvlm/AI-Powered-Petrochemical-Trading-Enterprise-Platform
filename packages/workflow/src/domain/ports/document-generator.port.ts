export interface DocumentTemplate {
  title: string;
  /** Static text blocks with {{variable}} placeholders, rendered top-to-bottom. */
  textBlocks: string[];
  /** Optional simple table: array of rows, each row an array of cell strings. */
  table?: { headers: string[]; rows: string[][] };
}

export interface GeneratedDocument {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

/**
 * Swappable document-generation seam (docs/DOMAIN_MODEL_PHASE2.md §7). No Document
 * Management module exists yet, so this port's only concrete implementation is a real
 * PDFKit renderer; a future Document Management module can add other adapters (DOCX,
 * templated HTML-to-PDF, etc.) behind this same interface without touching workflow code.
 */
export interface DocumentGeneratorPort {
  generate(template: DocumentTemplate, data: Record<string, unknown>): Promise<GeneratedDocument>;
}
