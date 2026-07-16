import PDFDocument from 'pdfkit';
import type {
  DocumentGeneratorPort,
  DocumentTemplate,
  GeneratedDocument,
} from '../domain/ports/document-generator.port';

function substitute(text: string, data: Record<string, unknown>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    const value = data[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

/**
 * Real PDF generation via pdfkit — no headless browser dependency. Produces an actual
 * valid PDF buffer, not a stub. Supports {{variable}} substitution in text blocks and a
 * minimal table renderer.
 */
export class PdfKitDocumentGenerator implements DocumentGeneratorPort {
  generate(template: DocumentTemplate, data: Record<string, unknown>): Promise<GeneratedDocument> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => {
        resolve({
          buffer: Buffer.concat(chunks),
          filename: `${substitute(template.title, data).replace(/[^a-z0-9-_]+/gi, '_')}.pdf`,
          mimeType: 'application/pdf',
        });
      });
      doc.on('error', reject);

      doc.fontSize(18).text(substitute(template.title, data), { align: 'center' });
      doc.moveDown();

      for (const block of template.textBlocks) {
        doc.fontSize(11).text(substitute(block, data));
        doc.moveDown(0.5);
      }

      if (template.table) {
        doc.moveDown();
        const { headers, rows } = template.table;
        doc.fontSize(11).text(headers.join('  |  '), { underline: true });
        for (const row of rows) {
          doc.text(row.map((cell) => substitute(cell, data)).join('  |  '));
        }
      }

      doc.end();
    });
  }
}
