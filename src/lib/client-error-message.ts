/**
 * Turns server-function failures into a safe, readable message for the UI.
 * A failed TanStack Start request can surface the server's HTML error page as
 * `Error.message`; rendering that whole document makes the Accounts page look
 * broken and can leak implementation details.
 */
export function clientErrorMessage(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const normalized = raw.trim();
  if (!normalized) return fallback;
  if (
    /<!doctype\s+html|<html[\s>]|This page didn't load|Something went wrong on our end/i.test(
      normalized,
    )
  ) {
    return fallback;
  }
  return normalized.slice(0, 500);
}
