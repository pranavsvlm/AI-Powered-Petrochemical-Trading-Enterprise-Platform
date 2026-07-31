/** Formats a raw embedding array as a pgvector literal (e.g. `[0.1,0.2,0.3]`) for use in raw SQL with a `::vector` cast. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
