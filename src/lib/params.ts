/** Route params may arrive still percent-encoded; decode defensively. */
export function decodeParam(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
