/**
 * Interpolates `{{var}}` placeholders in a prompt template's stored content. A placeholder
 * with no matching entry in `vars` is left untouched (fails soft, not silently blank) — a
 * missing variable is a template-authoring bug that should be visibly obvious in the
 * resolved prompt, not swallowed into an empty string.
 */
export function interpolatePrompt(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key]! : match,
  );
}
