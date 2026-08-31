/** Resolve the exact version-scoped export-template directory used by Godot. */
export function godotTemplateVersion(value) {
  const firstLine = String(value || '').trim().split(/\r?\n/u).find(Boolean) || '';
  return firstLine.match(/^(\d+\.\d+(?:\.\d+)?\.[A-Za-z][A-Za-z0-9_-]*)/u)?.[1] || null;
}

export function godotAndroidMinSdk(value) {
  const version = godotTemplateVersion(value);
  const major = Number(version?.match(/^(\d+)/u)?.[1]);
  return Number.isInteger(major) && major >= 4 ? 24 : null;
}
