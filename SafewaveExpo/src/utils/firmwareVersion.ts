/**
 * Firmware version helpers.
 *
 * Band-reported versions and Firestore manifest versions are dotted
 * sequences of unsigned integers (e.g. "0.1.0.36"). Parsing is lenient:
 * non-numeric segments and extra whitespace are rejected by returning
 * `null`, so callers can treat unparseable strings as "unknown" rather
 * than false-positive updates.
 */

const parseVersion = (raw: string | null | undefined): number[] | null => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parts = trimmed.split('.').map((p) => p.trim());
  const nums: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    nums.push(Number.parseInt(part, 10));
  }
  return nums;
};

/**
 * Compare two dotted-numeric firmware version strings.
 * @returns -1 if `a < b`, 0 if equal, 1 if `a > b`, or `null` if either
 *   side is unparseable.
 */
export const compareFirmwareVersions = (
  a: string | null | undefined,
  b: string | null | undefined
): -1 | 0 | 1 | null => {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (!pa || !pb) return null;

  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
};

/**
 * True only if `latest` is strictly newer than `current`. Returns false
 * when either version is unparseable — we prefer not to surface a false
 * update prompt when we can't verify the comparison.
 */
export const isFirmwareNewer = (
  current: string | null | undefined,
  latest: string | null | undefined
): boolean => {
  const cmp = compareFirmwareVersions(current, latest);
  return cmp === -1;
};
