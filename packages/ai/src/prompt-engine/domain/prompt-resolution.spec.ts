import { interpolatePrompt } from './prompt-resolution';

describe('interpolatePrompt', () => {
  it('substitutes every matching placeholder', () => {
    expect(
      interpolatePrompt('Hello {{name}}, you are a {{role}}.', { name: 'Ana', role: 'trader' }),
    ).toBe('Hello Ana, you are a trader.');
  });

  it('leaves a placeholder untouched when no matching variable is supplied', () => {
    expect(interpolatePrompt('Hello {{name}}, {{missing}}.', { name: 'Ana' })).toBe(
      'Hello Ana, {{missing}}.',
    );
  });

  it('tolerates whitespace inside the braces', () => {
    expect(interpolatePrompt('Hi {{ name }}!', { name: 'Ana' })).toBe('Hi Ana!');
  });

  it('substitutes repeated placeholders', () => {
    expect(interpolatePrompt('{{name}} and {{name}} again', { name: 'Ana' })).toBe(
      'Ana and Ana again',
    );
  });

  it('returns the template unchanged when there are no placeholders', () => {
    expect(interpolatePrompt('Plain text.', {})).toBe('Plain text.');
  });
});
