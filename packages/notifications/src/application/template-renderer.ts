/**
 * Real, tested {{variable}} substitution for notification templates. Unresolved variables
 * render as an empty string rather than leaving the raw placeholder, and nested paths
 * (e.g. {{user.firstName}}) are supported via dotted-key lookup.
 */
export class TemplateRenderer {
  static render(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
      const value = resolvePath(data, path);
      return value === undefined || value === null ? '' : String(value);
    });
  }
}

function resolvePath(data: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, data);
}
