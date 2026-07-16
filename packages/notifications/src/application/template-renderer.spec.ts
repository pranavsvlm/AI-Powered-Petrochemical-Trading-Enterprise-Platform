import { TemplateRenderer } from './template-renderer';

describe('TemplateRenderer.render', () => {
  it('substitutes simple variables', () => {
    expect(TemplateRenderer.render('Hello {{name}}!', { name: 'Ada' })).toBe('Hello Ada!');
  });

  it('substitutes nested dotted-path variables', () => {
    expect(TemplateRenderer.render('Hi {{user.firstName}}', { user: { firstName: 'Grace' } })).toBe(
      'Hi Grace',
    );
  });

  it('renders unresolved variables as empty string', () => {
    expect(TemplateRenderer.render('Value: {{missing}}', {})).toBe('Value: ');
  });

  it('renders multiple occurrences', () => {
    expect(TemplateRenderer.render('{{a}}-{{a}}-{{b}}', { a: '1', b: '2' })).toBe('1-1-2');
  });
});
