const ALLOWED_PROTOCOLS = new Set(["http:", "https:"]);

export function isLikelyValidImageUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;

  try {
    const parsed = new URL(trimmed);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) return false;
    if (!parsed.hostname) return false;
    return true;
  } catch {
    return false;
  }
}

export function normalizeImageUrl(value: string | null | undefined): string | null {
  if (!isLikelyValidImageUrl(value)) return null;
  return value!.trim();
}
