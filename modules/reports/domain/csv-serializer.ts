/**
 * Real RFC 4180-style CSV serialization — quotes a cell only when it contains a comma, quote,
 * or newline, doubling any embedded quotes. Simple enough not to justify a new dependency (see
 * docs/DOMAIN_MODEL_PHASE7.md, Analytics section — Excel export does pull in a real library
 * later, CSV doesn't need one).
 */
function escapeCell(cell: string | number): string {
  const str = String(cell);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const lines = [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => row.map(escapeCell).join(',')),
  ];
  return lines.join('\r\n');
}
