/**
 * Parses a chat model's text response as JSON, tolerating the common case where the model
 * wraps its answer in a markdown code fence (```json ... ```) even when explicitly instructed
 * to respond with raw JSON only. Every seam in packages/ai/src/seams uses this rather than a
 * bare `JSON.parse`.
 */
export function parseJsonResponse<T>(content: string | null, seamName: string): T {
  if (!content) {
    throw new Error(`${seamName}: the model returned no content to parse.`);
  }
  const stripped = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  try {
    return JSON.parse(stripped) as T;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `${seamName}: failed to parse the model's response as JSON (${reason}). Raw content: ${content}`,
    );
  }
}
