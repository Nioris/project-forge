const RELEASE_VARIANTS = new Set(['production', 'debug', 'marketing']);

/** Parse a Forge release archive name into its numeric version and exact variant. */
export function parseReleaseZipName(fileName) {
  if (typeof fileName !== 'string') return null;

  const match = fileName.match(/^(.+)-v(\d+(?:\.\d+)*)(-debug|-marketing)?\.zip$/i);
  if (!match) return null;

  return {
    fileName,
    project: match[1],
    version: match[2].split('.').map(Number),
    variant: match[3] ? match[3].slice(1).toLowerCase() : 'production',
  };
}

/** Compare numeric dotted versions without lexicographic mistakes (1.10 > 1.9). */
export function compareNumericVersions(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
}

/** Select the newest archive for one exact Forge release variant. */
export function selectLatestReleaseZip(entries, variant) {
  if (!RELEASE_VARIANTS.has(variant)) {
    throw new Error(`Unsupported release variant: ${variant}`);
  }

  let latest = null;
  for (const entry of entries) {
    const candidate = parseReleaseZipName(entry);
    if (!candidate || candidate.variant !== variant) continue;

    const versionOrder = latest
      ? compareNumericVersions(candidate.version, latest.version)
      : 1;
    if (versionOrder > 0 || (versionOrder === 0 && entry.localeCompare(latest.fileName) > 0)) {
      latest = candidate;
    }
  }

  return latest?.fileName ?? null;
}
