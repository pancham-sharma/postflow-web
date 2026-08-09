export type DiffKind = "added" | "removed" | "changed" | "same";

export interface DiffRow {
  path: string;
  kind: DiffKind;
  before: string | null;
  after: string | null;
}

function flatten(value: unknown, prefix = "", out: Record<string, string> = {}) {
  if (value === null || typeof value !== "object") {
    out[prefix || "(root)"] = JSON.stringify(value);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => flatten(item, `${prefix}[${i}]`, out));
    if (value.length === 0) out[prefix] = "[]";
    return out;
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) out[prefix] = "{}";
  for (const [key, val] of entries) {
    flatten(val, prefix ? `${prefix}.${key}` : key, out);
  }
  return out;
}

function parse(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** Flat key-path diff between two JSON payload snapshots. */
export function diffPayloads(beforeText: string | null, afterText: string | null): DiffRow[] {
  const before = flatten(parse(beforeText));
  const after = flatten(parse(afterText));
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();

  return paths.map((path) => {
    const b = before[path] ?? null;
    const a = after[path] ?? null;
    let kind: DiffKind = "same";
    if (b === null && a !== null) kind = "added";
    else if (a === null && b !== null) kind = "removed";
    else if (a !== b) kind = "changed";
    return { path, kind, before: b, after: a };
  });
}
