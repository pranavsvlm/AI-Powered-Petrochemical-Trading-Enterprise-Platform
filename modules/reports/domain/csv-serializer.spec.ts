import { toCsv } from './csv-serializer';

describe('toCsv', () => {
  it('serializes plain rows with a CRLF-joined header and body', () => {
    const csv = toCsv(
      ['Customer', 'Revenue'],
      [
        ['Acme Trading', 1000],
        ['Delta Oils', 2500],
      ],
    );
    expect(csv).toBe('Customer,Revenue\r\nAcme Trading,1000\r\nDelta Oils,2500');
  });

  it('quotes and escapes a cell containing a comma', () => {
    const csv = toCsv(['Name'], [['Smith, John']]);
    expect(csv).toBe('Name\r\n"Smith, John"');
  });

  it('quotes and doubles embedded quotes', () => {
    const csv = toCsv(['Note'], [['Say "hello"']]);
    expect(csv).toBe('Note\r\n"Say ""hello"""');
  });

  it('quotes a cell containing a newline', () => {
    const csv = toCsv(['Note'], [['line one\nline two']]);
    expect(csv).toBe('Note\r\n"line one\nline two"');
  });

  it('leaves plain numeric and alphanumeric cells unquoted', () => {
    const csv = toCsv(['Qty'], [[42]]);
    expect(csv).toBe('Qty\r\n42');
  });
});
