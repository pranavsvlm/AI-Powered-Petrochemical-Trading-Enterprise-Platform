import { castAttributeValue } from './attribute-cast';

describe('castAttributeValue', () => {
  it('parses NUMBER attributes and populates valueNumber', () => {
    const result = castAttributeValue({ dataType: 'NUMBER' }, '0.865');
    expect(result.value).toBe('0.865');
    expect(result.valueNumber).toBeCloseTo(0.865);
  });

  it('rejects an invalid NUMBER value', () => {
    expect(() => castAttributeValue({ dataType: 'NUMBER' }, 'not-a-number')).toThrow();
  });

  it('parses BOOLEAN attributes', () => {
    expect(castAttributeValue({ dataType: 'BOOLEAN' }, 'true').value).toBe('true');
  });

  it('rejects an invalid BOOLEAN value', () => {
    expect(() => castAttributeValue({ dataType: 'BOOLEAN' }, 'yes')).toThrow();
  });

  it('parses DATE attributes into ISO form', () => {
    const result = castAttributeValue({ dataType: 'DATE' }, '2026-01-01');
    expect(result.value).toBe(new Date('2026-01-01').toISOString());
  });

  it('passes STRING attributes through unchanged', () => {
    expect(castAttributeValue({ dataType: 'STRING' }, 'Amber').value).toBe('Amber');
  });
});
