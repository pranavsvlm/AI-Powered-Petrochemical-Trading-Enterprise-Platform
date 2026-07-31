import { parseJsonResponse } from './parse-json-response';

describe('parseJsonResponse', () => {
  it('parses raw JSON content', () => {
    expect(parseJsonResponse<{ a: number }>('{"a":1}', 'test')).toEqual({ a: 1 });
  });

  it('strips a ```json fence before parsing', () => {
    expect(parseJsonResponse<{ a: number }>('```json\n{"a":1}\n```', 'test')).toEqual({ a: 1 });
  });

  it('strips a bare ``` fence before parsing', () => {
    expect(parseJsonResponse<{ a: number }>('```\n{"a":1}\n```', 'test')).toEqual({ a: 1 });
  });

  it('throws a descriptive error when content is null', () => {
    expect(() => parseJsonResponse(null, 'test-seam')).toThrow(/test-seam.*no content/i);
  });

  it('throws a descriptive error including the raw content when JSON is malformed', () => {
    expect(() => parseJsonResponse('not json', 'test-seam')).toThrow(/test-seam.*not json/i);
  });
});
